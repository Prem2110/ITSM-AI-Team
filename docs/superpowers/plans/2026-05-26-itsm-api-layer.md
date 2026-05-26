# ITSM API Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full FastAPI API layer with dual-mode auth (fake + XSUAA) on top of the existing SQLAlchemy data layer.

**Architecture:** Auth resolves a `CallerContext` via `require_scope()` dependency factory; all business logic lives in `IncidentService`; routers are thin and call the service. Repositories are the only DB access point — services never write raw SQL.

**Tech Stack:** FastAPI, SQLAlchemy 2.0 async, Pydantic v2, httpx AsyncClient + ASGITransport for tests, pytest-asyncio with `asyncio_mode = "auto"`.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `backend/app/auth/context.py` | Create | `CallerContext` dataclass |
| `backend/app/auth/fake.py` | Create | `get_caller_fake` — X-Fake-User header auth |
| `backend/app/auth/xsuaa.py` | Create | `get_caller_xsuaa` — XSUAA JWT + JIT provisioning |
| `backend/app/auth/permissions.py` | Create | `get_caller` router + `require_scope()` factory |
| `backend/app/routers/session.py` | Create | `GET /api/me` |
| `backend/app/routers/incidents.py` | Create | Full incident CRUD + transition |
| `backend/app/routers/events.py` | Create | Incident event list + create |
| `backend/app/routers/attachments.py` | Create | File upload, download, delete |
| `backend/app/routers/config.py` | Create | Read-only priorities/categories/states |
| `backend/app/routers/users.py` | Create | List users with optional role filter |
| `backend/app/routers/dashboard.py` | Create | Summary stats |
| `backend/app/services/incident_service.py` | Create | create/update/transition/detail/sla_breach logic |
| `backend/app/main.py` | Modify | Wire all routers |
| `backend/app/schemas/incident.py` | Modify | Add request/response schemas (no state in create) |
| `backend/app/schemas/incident_event.py` | Modify | Add `attachment_deleted` type + `EventCreateRequest` |
| `backend/app/repositories/incident_repository.py` | Modify | Enhanced list/count + dashboard summary |
| `backend/app/repositories/incident_event_repository.py` | Modify | Add pagination + count |
| `backend/app/repositories/user_repository.py` | Modify | Add `list_by_role` |
| `backend/app/repositories/attachment_repository.py` | Modify | Add `delete` |
| `backend/tests/conftest.py` | Modify | Add `test_db` + `client` fixtures |
| `backend/tests/test_auth.py` | Create | Auth + /api/me tests |
| `backend/tests/test_routes_incidents.py` | Create | ~18 incident route scenarios |

---

## Task 1: Auth Layer + GET /api/me + Test Fixtures

**Files:**
- Create: `backend/app/auth/context.py`
- Create: `backend/app/auth/fake.py`
- Create: `backend/app/auth/xsuaa.py`
- Create: `backend/app/auth/permissions.py`
- Create: `backend/app/routers/session.py`
- Modify: `backend/app/main.py`
- Modify: `backend/tests/conftest.py`
- Create: `backend/tests/test_auth.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_auth.py`:

```python
from __future__ import annotations
import pytest
from tests.conftest import _seed_user


async def test_get_me_returns_caller(client, test_db):
    await _seed_user(test_db, "agent@test.com", "Test Agent", "agent")
    resp = await client.get("/api/me", headers={"X-Fake-User": "agent@test.com"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == "agent@test.com"
    assert data["name"] == "Test Agent"
    assert "TicketRead" in data["scopes"]
    assert "Agent" in data["scopes"]
    assert "Admin" not in data["scopes"]


async def test_get_me_missing_header(client):
    resp = await client.get("/api/me")
    assert resp.status_code == 401


async def test_get_me_unknown_user(client):
    resp = await client.get("/api/me", headers={"X-Fake-User": "ghost@test.com"})
    assert resp.status_code == 401


async def test_get_me_requester_scope(client, test_db):
    await _seed_user(test_db, "req@test.com", "Test Requester", "requester")
    resp = await client.get("/api/me", headers={"X-Fake-User": "req@test.com"})
    assert resp.status_code == 200
    data = resp.json()
    assert "TicketRead" in data["scopes"]
    assert "Agent" not in data["scopes"]


async def test_get_me_admin_has_all_scopes(client, test_db):
    await _seed_user(test_db, "admin@test.com", "Test Admin", "admin")
    resp = await client.get("/api/me", headers={"X-Fake-User": "admin@test.com"})
    assert resp.status_code == 200
    data = resp.json()
    assert set(data["scopes"]) == {"TicketRead", "TicketWrite", "Agent", "Admin"}
```

- [ ] **Step 2: Run tests to verify they fail**

```
cd backend
uv run pytest tests/test_auth.py -v
```

Expected: `ImportError` or `404` — auth modules don't exist yet.

- [ ] **Step 3: Create `backend/app/auth/context.py`**

```python
from __future__ import annotations
from dataclasses import dataclass, field


@dataclass
class CallerContext:
    user_id: str
    email: str
    name: str
    scopes: list[str] = field(default_factory=list)
```

- [ ] **Step 4: Create `backend/app/auth/fake.py`**

```python
from __future__ import annotations
from fastapi import Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from ..db import get_db
from ..repositories.user_repository import UserRepository
from .context import CallerContext

_ROLE_SCOPES: dict[str, list[str]] = {
    "requester": ["TicketRead", "TicketWrite"],
    "agent": ["TicketRead", "TicketWrite", "Agent"],
    "admin": ["TicketRead", "TicketWrite", "Agent", "Admin"],
}


async def get_caller_fake(
    request: Request,
    session: AsyncSession = Depends(get_db),
) -> CallerContext:
    email = request.headers.get("X-Fake-User")
    if not email:
        raise HTTPException(status_code=401, detail="X-Fake-User header required")
    user = await UserRepository(session).get_by_email(email)
    if user is None:
        raise HTTPException(status_code=401, detail="Unknown fake user")
    return CallerContext(
        user_id=user.id,
        email=user.email,
        name=user.name,
        scopes=_ROLE_SCOPES.get(user.role, []),
    )
```

- [ ] **Step 5: Create `backend/app/auth/xsuaa.py`**

```python
from __future__ import annotations
import logging
from fastapi import Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from ..db import get_db
from ..repositories.user_repository import UserRepository
from ..schemas.user import UserCreate
from ..config import env_settings
from .context import CallerContext

logger = logging.getLogger(__name__)

try:
    from sap.xssec.security_context import SecurityContext as _SecurityContext
    _xssec = _SecurityContext
except ImportError:
    logger.warning(
        "sap-xssec not installed — AUTH_MODE=real is unavailable. "
        "Set AUTH_MODE=fake for local development."
    )
    _xssec = None

_SCOPE_LEVELS: dict[str, list[str]] = {
    "Viewer": ["TicketRead"],
    "Support": ["TicketRead", "TicketWrite"],
    "Agent": ["TicketRead", "TicketWrite", "Agent"],
    "Admin": ["TicketRead", "TicketWrite", "Agent", "Admin"],
}


def _scopes_from_token(token_info: dict) -> list[str]:
    xsappname = env_settings.xsuaa_xsappname
    result: list[str] = []
    for raw_scope in token_info.get("scope", []):
        suffix = raw_scope.split(".")[-1]
        if raw_scope.startswith(xsappname) and suffix in _SCOPE_LEVELS:
            result = _SCOPE_LEVELS[suffix]
    return result


async def get_caller_xsuaa(
    request: Request,
    session: AsyncSession = Depends(get_db),
) -> CallerContext:
    if _xssec is None:
        raise HTTPException(
            status_code=503,
            detail="XSUAA auth unavailable — sap-xssec not installed",
        )
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Bearer token required")
    token = auth_header[len("Bearer "):]
    try:
        sc = _xssec(
            token,
            {
                "url": env_settings.xsuaa_url,
                "clientid": env_settings.xsuaa_client_id,
                "clientsecret": env_settings.xsuaa_client_secret,
                "xsappname": env_settings.xsuaa_xsappname,
            },
        )
    except Exception as exc:
        raise HTTPException(status_code=401, detail=f"Invalid token: {exc}") from exc

    email: str = (sc.get_email() or sc.get_logon_name() or "").lower()
    name: str = sc.get_given_name() or email

    repo = UserRepository(session)
    user = await repo.get_by_email(email)
    if user is None:
        user = await repo.create(UserCreate(email=email, name=name, role="requester"))

    token_info = getattr(sc, "token_info", {}) or {}
    scopes = _scopes_from_token(token_info)
    return CallerContext(user_id=user.id, email=user.email, name=user.name, scopes=scopes)
```

- [ ] **Step 6: Create `backend/app/auth/permissions.py`**

```python
from __future__ import annotations
from fastapi import Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from ..db import get_db
from ..config import env_settings
from .context import CallerContext


async def get_caller(
    request: Request,
    session: AsyncSession = Depends(get_db),
) -> CallerContext:
    if env_settings.auth_mode == "fake":
        from .fake import get_caller_fake
        return await get_caller_fake(request, session)
    from .xsuaa import get_caller_xsuaa
    return await get_caller_xsuaa(request, session)


def require_scope(*required_scopes: str):
    async def _check(caller: CallerContext = Depends(get_caller)) -> CallerContext:
        missing = [s for s in required_scopes if s not in caller.scopes]
        if missing:
            raise HTTPException(status_code=403, detail=f"Missing scopes: {missing}")
        return caller
    return Depends(_check)
```

- [ ] **Step 7: Create `backend/app/routers/session.py`**

```python
from __future__ import annotations
from fastapi import APIRouter
from ..auth.permissions import require_scope
from ..auth.context import CallerContext

router = APIRouter(prefix="/api", tags=["session"])


@router.get("/me")
async def get_me(caller: CallerContext = require_scope("TicketRead")) -> dict:
    return {
        "user_id": caller.user_id,
        "email": caller.email,
        "name": caller.name,
        "scopes": caller.scopes,
    }
```

- [ ] **Step 8: Update `backend/tests/conftest.py`**

Replace entire file:

```python
from __future__ import annotations
import dataclasses
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.db import Base, get_db
import app.models  # noqa: F401 — registers all models with Base.metadata


@dataclasses.dataclass
class SeedUser:
    id: str
    email: str
    name: str
    role: str


async def _seed_user(factory, email: str, name: str, role: str) -> SeedUser:
    from app.repositories.user_repository import UserRepository
    from app.schemas.user import UserCreate
    async with factory() as session:
        user = await UserRepository(session).create(
            UserCreate(email=email, name=name, role=role)
        )
        await session.commit()
        return SeedUser(id=user.id, email=user.email, name=user.name, role=user.role)


@pytest_asyncio.fixture
async def db_session() -> AsyncSession:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    async with factory() as session:
        yield session
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def test_db():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    yield factory
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def client(test_db):
    from app.main import app

    async def override_get_db():
        async with test_db() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac
    app.dependency_overrides.clear()
```

- [ ] **Step 9: Update `backend/app/main.py`** to include session router

```python
from __future__ import annotations
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .config import env_settings
from .routers import session

app = FastAPI(
    title="ITSM API",
    version="0.1.0",
    description="Single-tenant IT Service Management API",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=env_settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(session.router)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "version": app.version}
```

- [ ] **Step 10: Run tests to verify they pass**

```
cd backend
uv run pytest tests/test_auth.py -v
```

Expected: 5 PASSED

- [ ] **Step 11: Commit**

```
git add backend/app/auth/context.py backend/app/auth/fake.py backend/app/auth/xsuaa.py backend/app/auth/permissions.py backend/app/routers/session.py backend/app/main.py backend/tests/conftest.py backend/tests/test_auth.py
git commit -m "feat: add auth layer (fake + xsuaa) and GET /api/me"
```

---

## Task 2: Schema Additions + Repository Enhancements

**Files:**
- Modify: `backend/app/schemas/incident.py`
- Modify: `backend/app/schemas/incident_event.py`
- Modify: `backend/app/repositories/incident_repository.py`
- Modify: `backend/app/repositories/incident_event_repository.py`
- Modify: `backend/app/repositories/user_repository.py`
- Modify: `backend/app/repositories/attachment_repository.py`

- [ ] **Step 1: Write failing tests for repository enhancements**

Create `backend/tests/test_repositories.py`:

```python
from __future__ import annotations
import pytest
from tests.conftest import _seed_user
from app.repositories.incident_repository import IncidentRepository
from app.repositories.incident_event_repository import IncidentEventRepository
from app.repositories.user_repository import UserRepository
from app.repositories.attachment_repository import AttachmentRepository
from app.schemas.incident import IncidentCreate
from app.schemas.incident_event import IncidentEventCreate
from app.schemas.attachment import AttachmentCreate


async def _make_incident(session, requester_id: str, title: str = "Test", priority: int = 3):
    repo = IncidentRepository(session)
    return await repo.create(IncidentCreate(
        title=title,
        description="desc",
        priority=priority,
        category="Network",
        source="web",
        requester_id=requester_id,
    ))


async def test_incident_list_filter_unassigned(db_session):
    from app.schemas.user import UserCreate
    user = await UserRepository(db_session).create(UserCreate(email="u@t.com", name="U", role="agent"))
    inc = await _make_incident(db_session, user.id)
    # unassigned filter
    results = await IncidentRepository(db_session).list(assignee_id="unassigned")
    assert any(i.id == inc.id for i in results)


async def test_incident_list_filter_q(db_session):
    from app.schemas.user import UserCreate
    user = await UserRepository(db_session).create(UserCreate(email="u2@t.com", name="U2", role="agent"))
    await _make_incident(db_session, user.id, title="Network is down")
    await _make_incident(db_session, user.id, title="Printer broken")
    results = await IncidentRepository(db_session).list(q="network")
    assert len(results) == 1
    assert "Network" in results[0].title


async def test_incident_count_matches_list(db_session):
    from app.schemas.user import UserCreate
    user = await UserRepository(db_session).create(UserCreate(email="u3@t.com", name="U3", role="agent"))
    for i in range(3):
        await _make_incident(db_session, user.id, title=f"Inc {i}")
    count = await IncidentRepository(db_session).count()
    items = await IncidentRepository(db_session).list()
    assert count == len(items)


async def test_event_repo_pagination(db_session):
    from app.schemas.user import UserCreate
    user = await UserRepository(db_session).create(UserCreate(email="u4@t.com", name="U4", role="agent"))
    inc = await _make_incident(db_session, user.id)
    repo = IncidentEventRepository(db_session)
    for i in range(5):
        await repo.create(IncidentEventCreate(
            incident_id=inc.id, actor_id=user.id,
            event_type="comment", body=f"comment {i}",
        ))
    page1 = await repo.list_for_incident(inc.id, limit=2, offset=0, order="asc")
    assert len(page1) == 2
    total = await repo.count_for_incident(inc.id)
    assert total == 5


async def test_user_repo_list_by_role(db_session):
    from app.schemas.user import UserCreate
    await UserRepository(db_session).create(UserCreate(email="a1@t.com", name="A1", role="agent"))
    await UserRepository(db_session).create(UserCreate(email="r1@t.com", name="R1", role="requester"))
    agents = await UserRepository(db_session).list_by_role("agent")
    assert all(u.role == "agent" for u in agents)


async def test_attachment_repo_delete(db_session):
    from app.schemas.user import UserCreate
    user = await UserRepository(db_session).create(UserCreate(email="u5@t.com", name="U5", role="agent"))
    inc = await _make_incident(db_session, user.id)
    repo = AttachmentRepository(db_session)
    att = await repo.create(AttachmentCreate(
        incident_id=inc.id, filename="f.txt", mime_type="text/plain",
        size_bytes=10, blob_ref="/tmp/f.txt", uploaded_by=user.id,
    ))
    deleted = await repo.delete(att.id)
    assert deleted is True
    assert await repo.get_by_id(att.id) is None


async def test_dashboard_summary(db_session):
    from app.schemas.user import UserCreate
    user = await UserRepository(db_session).create(UserCreate(email="u6@t.com", name="U6", role="agent"))
    await _make_incident(db_session, user.id)
    summary = await IncidentRepository(db_session).get_dashboard_summary(user.id)
    assert "my_open" in summary
    assert "all_open" in summary
    assert "unassigned" in summary
    assert "breached" in summary
    assert "by_state" in summary
    assert "by_priority" in summary
    assert summary["all_open"] >= 1
```

- [ ] **Step 2: Run tests to verify they fail**

```
cd backend
uv run pytest tests/test_repositories.py -v
```

Expected: failures on missing methods/imports.

- [ ] **Step 3: Replace `backend/app/schemas/incident.py`**

```python
from __future__ import annotations
from datetime import datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, field_validator
from ..config import app_config
from .user import UserResponse
from .incident_event import IncidentEventResponse

_VALID_SOURCES = frozenset({"web", "email", "classifier_escalation", "fix_failed_escalation"})


class IncidentCreate(BaseModel):
    """Internal schema used by IncidentService → IncidentRepository.create()."""
    title: str
    description: str
    priority: int
    category: str
    source: str
    requester_id: str
    assignee_id: str | None = None

    @field_validator("priority")
    @classmethod
    def valid_priority(cls, v: int) -> int:
        if not 1 <= v <= len(app_config.priorities):
            raise ValueError(f"priority must be 1–{len(app_config.priorities)}")
        return v

    @field_validator("category")
    @classmethod
    def valid_category(cls, v: str) -> str:
        if v not in app_config.categories:
            raise ValueError(f"category must be one of: {app_config.categories}")
        return v

    @field_validator("source")
    @classmethod
    def valid_source(cls, v: str) -> str:
        if v not in _VALID_SOURCES:
            raise ValueError(f"source must be one of: {sorted(_VALID_SOURCES)}")
        return v


class IncidentCreateRequest(BaseModel):
    """API request body for POST /api/incidents. No state field — always starts 'new'."""
    model_config = ConfigDict(extra="forbid")

    title: str
    description: str
    priority: int
    category: str
    source: str = "web"
    assignee_id: str | None = None
    requester_id: str | None = None  # defaults to caller.user_id if omitted

    @field_validator("priority")
    @classmethod
    def valid_priority(cls, v: int) -> int:
        if not 1 <= v <= len(app_config.priorities):
            raise ValueError(f"priority must be 1–{len(app_config.priorities)}")
        return v

    @field_validator("category")
    @classmethod
    def valid_category(cls, v: str) -> str:
        if v not in app_config.categories:
            raise ValueError(f"category must be one of: {app_config.categories}")
        return v

    @field_validator("source")
    @classmethod
    def valid_source(cls, v: str) -> str:
        if v not in _VALID_SOURCES:
            raise ValueError(f"source must be one of: {sorted(_VALID_SOURCES)}")
        return v


class IncidentPatchRequest(BaseModel):
    """API request body for PATCH /api/incidents/{id}. Agent-only. No state field."""
    model_config = ConfigDict(extra="forbid")

    title: str | None = None
    description: str | None = None
    priority: int | None = None
    category: str | None = None
    assignee_id: str | None = None

    @field_validator("priority")
    @classmethod
    def valid_priority(cls, v: int | None) -> int | None:
        if v is not None and not 1 <= v <= len(app_config.priorities):
            raise ValueError(f"priority must be 1–{len(app_config.priorities)}")
        return v

    @field_validator("category")
    @classmethod
    def valid_category(cls, v: str | None) -> str | None:
        if v is not None and v not in app_config.categories:
            raise ValueError(f"category must be one of: {app_config.categories}")
        return v


class TransitionRequest(BaseModel):
    """API request body for POST /api/incidents/{id}/transition."""
    model_config = ConfigDict(extra="forbid")

    to_state: str
    resolution_code: str | None = None
    resolution_notes: str | None = None

    @field_validator("to_state")
    @classmethod
    def valid_to_state(cls, v: str) -> str:
        if v not in app_config.states:
            raise ValueError(f"to_state must be one of: {app_config.states}")
        return v


class IncidentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    number: str
    title: str
    description: str
    state: str
    priority: int
    category: str
    source: str
    requester_id: str
    assignee_id: str | None
    resolution_code: str | None
    resolution_notes: str | None
    sla_resolution_due: datetime | None
    sla_breached: bool
    created_at: datetime
    updated_at: datetime
    resolved_at: datetime | None
    closed_at: datetime | None


class IncidentListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    number: str
    title: str
    state: str
    priority: int
    category: str
    assignee_id: str | None
    sla_breached: bool
    created_at: datetime
    updated_at: datetime


class IncidentListResponse(BaseModel):
    items: list[IncidentListItem]
    total: int
    page: int
    page_size: int


class IncidentDetail(BaseModel):
    """Full incident with requester/assignee and last 50 events."""
    id: str
    number: str
    title: str
    description: str
    state: str
    priority: int
    category: str
    source: str
    requester_id: str
    assignee_id: str | None
    resolution_code: str | None
    resolution_notes: str | None
    sla_resolution_due: datetime | None
    sla_breached: bool
    created_at: datetime
    updated_at: datetime
    resolved_at: datetime | None
    closed_at: datetime | None
    requester: UserResponse
    assignee: UserResponse | None
    events: list[IncidentEventResponse]
```

- [ ] **Step 4: Replace `backend/app/schemas/incident_event.py`**

```python
from __future__ import annotations
from datetime import datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, field_validator

_VALID_EVENT_TYPES = frozenset({
    "comment", "work_note", "state_change", "field_update",
    "assignment", "attachment_added", "attachment_deleted",
})


class IncidentEventCreate(BaseModel):
    incident_id: str
    actor_id: str
    event_type: str
    body: str | None = None
    event_metadata: dict | None = None

    @field_validator("event_type")
    @classmethod
    def valid_event_type(cls, v: str) -> str:
        if v not in _VALID_EVENT_TYPES:
            raise ValueError(f"event_type must be one of: {sorted(_VALID_EVENT_TYPES)}")
        return v


class EventCreateRequest(BaseModel):
    """API request body for POST /api/incidents/{id}/events."""
    model_config = ConfigDict(extra="forbid")

    event_type: Literal["comment", "work_note"]
    body: str


class IncidentEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    incident_id: str
    actor_id: str
    event_type: str
    body: str | None
    event_metadata: dict | None
    created_at: datetime
```

- [ ] **Step 5: Replace `backend/app/repositories/incident_repository.py`**

```python
from __future__ import annotations
import uuid
from datetime import datetime, timedelta
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from ..models.incident import Incident
from ..schemas.incident import IncidentCreate
from ..config import app_config
from ..services.numbering import next_incident_number
from ..utils import utcnow

_INCIDENT_UPDATABLE = frozenset({
    "title", "description", "priority", "category", "assignee_id",
    "state", "resolution_code", "resolution_notes",
    "resolved_at", "closed_at", "sla_breached", "sla_resolution_due", "updated_at",
})

_CLOSED_STATES = frozenset({"resolved", "closed"})


def _sla_due(priority: int, created_at: datetime) -> datetime:
    hours = app_config.priorities[priority - 1].sla_hours
    return created_at + timedelta(hours=hours)


class IncidentRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(self, data: IncidentCreate) -> Incident:
        now = utcnow()
        number = await next_incident_number(self.session)
        incident = Incident(
            id=str(uuid.uuid4()),
            number=number,
            title=data.title,
            description=data.description,
            state="new",
            priority=data.priority,
            category=data.category,
            source=data.source,
            requester_id=data.requester_id,
            assignee_id=data.assignee_id,
            sla_resolution_due=_sla_due(data.priority, now),
            created_at=now,
            updated_at=now,
        )
        self.session.add(incident)
        return incident

    async def get_by_id(self, incident_id: str) -> Incident | None:
        result = await self.session.execute(
            select(Incident).where(Incident.id == incident_id)
        )
        return result.scalar_one_or_none()

    async def get_by_number(self, number: str) -> Incident | None:
        result = await self.session.execute(
            select(Incident).where(Incident.number == number)
        )
        return result.scalar_one_or_none()

    async def get_with_events(self, incident_id: str) -> Incident | None:
        result = await self.session.execute(
            select(Incident)
            .options(selectinload(Incident.events))
            .where(Incident.id == incident_id)
        )
        return result.scalar_one_or_none()

    async def get_with_attachments(self, incident_id: str) -> Incident | None:
        result = await self.session.execute(
            select(Incident)
            .options(selectinload(Incident.attachments))
            .where(Incident.id == incident_id)
        )
        return result.scalar_one_or_none()

    async def list(
        self,
        state: str | None = None,
        priority: int | None = None,
        assignee_id: str | None = None,
        requester_id: str | None = None,
        q: str | None = None,
        category: str | None = None,
        sort: str = "created_at",
        order: str = "desc",
        limit: int = 50,
        offset: int = 0,
    ) -> list[Incident]:
        query = select(Incident)
        if state is not None:
            query = query.where(Incident.state == state)
        if priority is not None:
            query = query.where(Incident.priority == priority)
        if assignee_id == "unassigned":
            query = query.where(Incident.assignee_id.is_(None))
        elif assignee_id is not None:
            query = query.where(Incident.assignee_id == assignee_id)
        if requester_id is not None:
            query = query.where(Incident.requester_id == requester_id)
        if q is not None:
            query = query.where(Incident.title.ilike(f"%{q}%"))
        if category is not None:
            query = query.where(Incident.category == category)
        sort_col = {
            "created_at": Incident.created_at,
            "updated_at": Incident.updated_at,
            "priority": Incident.priority,
            "number": Incident.number,
        }.get(sort, Incident.created_at)
        query = query.order_by(sort_col.asc() if order == "asc" else sort_col.desc())
        query = query.limit(limit).offset(offset)
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def count(
        self,
        state: str | None = None,
        priority: int | None = None,
        assignee_id: str | None = None,
        requester_id: str | None = None,
        q: str | None = None,
        category: str | None = None,
    ) -> int:
        query = select(func.count()).select_from(Incident)
        if state is not None:
            query = query.where(Incident.state == state)
        if priority is not None:
            query = query.where(Incident.priority == priority)
        if assignee_id == "unassigned":
            query = query.where(Incident.assignee_id.is_(None))
        elif assignee_id is not None:
            query = query.where(Incident.assignee_id == assignee_id)
        if requester_id is not None:
            query = query.where(Incident.requester_id == requester_id)
        if q is not None:
            query = query.where(Incident.title.ilike(f"%{q}%"))
        if category is not None:
            query = query.where(Incident.category == category)
        result = await self.session.execute(query)
        return result.scalar_one()

    async def update(self, incident_id: str, fields: dict) -> Incident | None:
        incident = await self.get_by_id(incident_id)
        if incident is None:
            return None
        for k, v in fields.items():
            if k not in _INCIDENT_UPDATABLE:
                raise ValueError(f"Field '{k}' is not updatable")
            setattr(incident, k, v)
        return incident

    async def get_dashboard_summary(self, caller_user_id: str) -> dict:
        my_open = (await self.session.execute(
            select(func.count()).select_from(Incident).where(
                Incident.assignee_id == caller_user_id,
                Incident.state.notin_(_CLOSED_STATES),
            )
        )).scalar_one()

        all_open = (await self.session.execute(
            select(func.count()).select_from(Incident).where(
                Incident.state.notin_(_CLOSED_STATES)
            )
        )).scalar_one()

        unassigned = (await self.session.execute(
            select(func.count()).select_from(Incident).where(
                Incident.assignee_id.is_(None),
                Incident.state.notin_(_CLOSED_STATES),
            )
        )).scalar_one()

        breached = (await self.session.execute(
            select(func.count()).select_from(Incident).where(
                Incident.sla_breached.is_(True),
                Incident.state.notin_(_CLOSED_STATES),
            )
        )).scalar_one()

        by_state_rows = (await self.session.execute(
            select(Incident.state, func.count().label("cnt"))
            .where(Incident.state.notin_(_CLOSED_STATES))
            .group_by(Incident.state)
        )).all()
        by_state = {row.state: row.cnt for row in by_state_rows}

        by_priority_rows = (await self.session.execute(
            select(Incident.priority, func.count().label("cnt"))
            .where(Incident.state.notin_(_CLOSED_STATES))
            .group_by(Incident.priority)
            .order_by(Incident.priority)
        )).all()
        by_priority = {row.priority: row.cnt for row in by_priority_rows}

        return {
            "my_open": my_open,
            "all_open": all_open,
            "unassigned": unassigned,
            "breached": breached,
            "by_state": by_state,
            "by_priority": by_priority,
        }
```

- [ ] **Step 6: Replace `backend/app/repositories/incident_event_repository.py`**

```python
from __future__ import annotations
import uuid
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from ..models.incident_event import IncidentEvent
from ..schemas.incident_event import IncidentEventCreate


class IncidentEventRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(self, data: IncidentEventCreate) -> IncidentEvent:
        event = IncidentEvent(
            id=str(uuid.uuid4()),
            incident_id=data.incident_id,
            actor_id=data.actor_id,
            event_type=data.event_type,
            body=data.body,
            event_metadata=data.event_metadata,
        )
        self.session.add(event)
        return event

    async def list_for_incident(
        self,
        incident_id: str,
        limit: int = 50,
        offset: int = 0,
        order: str = "desc",
    ) -> list[IncidentEvent]:
        q = select(IncidentEvent).where(IncidentEvent.incident_id == incident_id)
        q = q.order_by(
            IncidentEvent.created_at.asc() if order == "asc"
            else IncidentEvent.created_at.desc()
        )
        q = q.limit(limit).offset(offset)
        result = await self.session.execute(q)
        return list(result.scalars().all())

    async def count_for_incident(self, incident_id: str) -> int:
        result = await self.session.execute(
            select(func.count()).select_from(IncidentEvent).where(
                IncidentEvent.incident_id == incident_id
            )
        )
        return result.scalar_one()
```

- [ ] **Step 7: Update `backend/app/repositories/user_repository.py`** — add `list_by_role`

Append after `list_active`:

```python
    async def list_by_role(self, role: str) -> list[User]:
        result = await self.session.execute(
            select(User).where(User.role == role, User.active.is_(True)).order_by(User.name)
        )
        return list(result.scalars().all())
```

- [ ] **Step 8: Update `backend/app/repositories/attachment_repository.py`** — add `delete`

Append after `get_by_id`:

```python
    async def delete(self, attachment_id: str) -> bool:
        att = await self.get_by_id(attachment_id)
        if att is None:
            return False
        await self.session.delete(att)
        return True
```

- [ ] **Step 9: Run tests to verify they pass**

```
cd backend
uv run pytest tests/test_repositories.py tests/test_auth.py -v
```

Expected: All PASSED.

- [ ] **Step 10: Commit**

```
git add backend/app/schemas/incident.py backend/app/schemas/incident_event.py backend/app/repositories/incident_repository.py backend/app/repositories/incident_event_repository.py backend/app/repositories/user_repository.py backend/app/repositories/attachment_repository.py backend/tests/test_repositories.py
git commit -m "feat: add API schemas and repository enhancements (list/count/dashboard/pagination)"
```

---

## Task 3: IncidentService

**Files:**
- Create: `backend/app/services/incident_service.py`

- [ ] **Step 1: Write failing tests for IncidentService**

Create `backend/tests/test_incident_service.py`:

```python
from __future__ import annotations
import pytest
from app.services.incident_service import IncidentService
from app.repositories.user_repository import UserRepository
from app.schemas.user import UserCreate
from app.schemas.incident import IncidentCreateRequest, IncidentPatchRequest, TransitionRequest
from app.auth.context import CallerContext
from fastapi import HTTPException


async def _make_agent(session) -> tuple[str, CallerContext]:
    user = await UserRepository(session).create(
        UserCreate(email="agent@svc.com", name="Agent", role="agent")
    )
    ctx = CallerContext(user_id=user.id, email=user.email, name=user.name,
                       scopes=["TicketRead", "TicketWrite", "Agent"])
    return user.id, ctx


async def _make_requester(session) -> tuple[str, CallerContext]:
    user = await UserRepository(session).create(
        UserCreate(email="req@svc.com", name="Requester", role="requester")
    )
    ctx = CallerContext(user_id=user.id, email=user.email, name=user.name,
                       scopes=["TicketRead", "TicketWrite"])
    return user.id, ctx


async def test_create_incident_sets_new_state(db_session):
    _, agent_ctx = await _make_agent(db_session)
    svc = IncidentService(db_session)
    req = IncidentCreateRequest(title="Broken printer", description="Won't print",
                                priority=3, category="Hardware")
    inc = await svc.create_incident(req, agent_ctx)
    assert inc.state == "new"
    assert inc.number.startswith("INC")


async def test_create_incident_defaults_requester_to_caller(db_session):
    _, agent_ctx = await _make_agent(db_session)
    svc = IncidentService(db_session)
    req = IncidentCreateRequest(title="VPN down", description="Can't connect",
                                priority=1, category="Network")
    inc = await svc.create_incident(req, agent_ctx)
    assert inc.requester_id == agent_ctx.user_id


async def test_update_incident_writes_field_update_event(db_session):
    _, agent_ctx = await _make_agent(db_session)
    svc = IncidentService(db_session)
    req = IncidentCreateRequest(title="Old title", description="desc", priority=3, category="Hardware")
    inc = await svc.create_incident(req, agent_ctx)
    await db_session.flush()

    patch = IncidentPatchRequest(title="New title")
    updated = await svc.update_incident(inc.id, patch, agent_ctx)
    assert updated.title == "New title"


async def test_transition_new_to_assigned(db_session):
    _, agent_ctx = await _make_agent(db_session)
    svc = IncidentService(db_session)
    req = IncidentCreateRequest(title="Test", description="d", priority=2, category="Software")
    inc = await svc.create_incident(req, agent_ctx)
    await db_session.flush()

    result = await svc.transition_incident(
        inc.id, TransitionRequest(to_state="assigned"), agent_ctx
    )
    assert result.state == "assigned"


async def test_transition_to_resolved_requires_resolution_fields(db_session):
    _, agent_ctx = await _make_agent(db_session)
    svc = IncidentService(db_session)
    req = IncidentCreateRequest(title="T", description="d", priority=3, category="Network")
    inc = await svc.create_incident(req, agent_ctx)
    await db_session.flush()

    # Force in_progress state directly so we can resolve
    from app.repositories.incident_repository import IncidentRepository
    await IncidentRepository(db_session).update(inc.id, {"state": "in_progress"})
    await db_session.flush()

    with pytest.raises(HTTPException) as exc_info:
        await svc.transition_incident(
            inc.id, TransitionRequest(to_state="resolved"), agent_ctx
        )
    assert exc_info.value.status_code == 422


async def test_transition_requester_can_close_own_resolved(db_session):
    req_id, req_ctx = await _make_requester(db_session)
    _, agent_ctx = await _make_agent(db_session)
    svc = IncidentService(db_session)
    create_req = IncidentCreateRequest(title="My ticket", description="d", priority=3,
                                       category="Hardware", requester_id=req_id)
    inc = await svc.create_incident(create_req, agent_ctx)
    await db_session.flush()

    # Force resolved state
    from app.repositories.incident_repository import IncidentRepository
    await IncidentRepository(db_session).update(inc.id, {
        "state": "resolved",
        "resolution_code": "fixed",
        "resolution_notes": "All good",
    })
    await db_session.flush()

    result = await svc.transition_incident(
        inc.id, TransitionRequest(to_state="closed"), req_ctx
    )
    assert result.state == "closed"


async def test_transition_requester_cannot_close_other_ticket(db_session):
    req_id, req_ctx = await _make_requester(db_session)
    _, agent_ctx = await _make_agent(db_session)
    svc = IncidentService(db_session)
    # Incident owned by agent, not by requester
    create_req = IncidentCreateRequest(title="Agent ticket", description="d", priority=3,
                                       category="Hardware", requester_id=agent_ctx.user_id)
    inc = await svc.create_incident(create_req, agent_ctx)
    await db_session.flush()

    from app.repositories.incident_repository import IncidentRepository
    await IncidentRepository(db_session).update(inc.id, {
        "state": "resolved",
        "resolution_code": "fixed",
        "resolution_notes": "Done",
    })
    await db_session.flush()

    with pytest.raises(HTTPException) as exc_info:
        await svc.transition_incident(
            inc.id, TransitionRequest(to_state="closed"), req_ctx
        )
    assert exc_info.value.status_code == 403


async def test_sla_breach_check_marks_overdue(db_session):
    _, agent_ctx = await _make_agent(db_session)
    svc = IncidentService(db_session)
    req = IncidentCreateRequest(title="Old critical", description="d", priority=1, category="Network")
    inc = await svc.create_incident(req, agent_ctx)
    await db_session.flush()

    # Backdate sla_resolution_due to past
    from datetime import timezone
    from app.repositories.incident_repository import IncidentRepository
    from app.utils import utcnow
    past = utcnow().replace(year=2020)
    await IncidentRepository(db_session).update(inc.id, {"sla_resolution_due": past})
    await db_session.flush()

    await svc.check_and_update_sla_breach(inc)
    refreshed = await IncidentRepository(db_session).get_by_id(inc.id)
    assert refreshed.sla_breached is True
```

- [ ] **Step 2: Run tests to verify they fail**

```
cd backend
uv run pytest tests/test_incident_service.py -v
```

Expected: `ImportError` on `IncidentService`.

- [ ] **Step 3: Create `backend/app/services/incident_service.py`**

```python
from __future__ import annotations
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from ..repositories.incident_repository import IncidentRepository, _sla_due
from ..repositories.incident_event_repository import IncidentEventRepository
from ..repositories.user_repository import UserRepository
from ..schemas.incident import (
    IncidentCreate, IncidentCreateRequest, IncidentPatchRequest,
    TransitionRequest, IncidentDetail,
)
from ..schemas.incident_event import IncidentEventCreate
from ..schemas.user import UserResponse
from ..schemas.incident_event import IncidentEventResponse
from ..state_machine import validate_transition
from ..utils import utcnow
from ..auth.context import CallerContext


class IncidentService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self._inc = IncidentRepository(session)
        self._evt = IncidentEventRepository(session)
        self._usr = UserRepository(session)

    async def create_incident(self, req: IncidentCreateRequest, caller: CallerContext):
        requester_id = req.requester_id or caller.user_id
        create_data = IncidentCreate(
            title=req.title,
            description=req.description,
            priority=req.priority,
            category=req.category,
            source=req.source,
            requester_id=requester_id,
            assignee_id=req.assignee_id,
        )
        incident = await self._inc.create(create_data)
        await self._evt.create(IncidentEventCreate(
            incident_id=incident.id,
            actor_id=caller.user_id,
            event_type="field_update",
            body=None,
            event_metadata={"action": "created", "title": req.title},
        ))
        return incident

    async def update_incident(
        self, incident_id: str, req: IncidentPatchRequest, caller: CallerContext
    ):
        incident = await self._inc.get_by_id(incident_id)
        if incident is None:
            raise HTTPException(status_code=404, detail="Incident not found")

        fields = req.model_dump(exclude_none=True)
        if not fields:
            return incident

        changed: dict = {}
        for k, v in fields.items():
            old = getattr(incident, k)
            if old != v:
                changed[k] = {"old": old, "new": v}

        if not changed:
            return incident

        if "priority" in changed:
            fields["sla_resolution_due"] = _sla_due(fields["priority"], incident.created_at)

        fields["updated_at"] = utcnow()
        await self._inc.update(incident_id, fields)

        for field_name, vals in changed.items():
            await self._evt.create(IncidentEventCreate(
                incident_id=incident_id,
                actor_id=caller.user_id,
                event_type="field_update",
                body=None,
                event_metadata={
                    "field": field_name,
                    "old": str(vals["old"]),
                    "new": str(vals["new"]),
                },
            ))

        return incident

    async def transition_incident(
        self, incident_id: str, req: TransitionRequest, caller: CallerContext
    ):
        incident = await self._inc.get_by_id(incident_id)
        if incident is None:
            raise HTTPException(status_code=404, detail="Incident not found")

        is_agent = "Agent" in caller.scopes
        if not is_agent:
            if (incident.state, req.to_state) != ("resolved", "closed"):
                raise HTTPException(
                    status_code=403,
                    detail="Requesters may only close a resolved ticket.",
                )
            if incident.requester_id != caller.user_id:
                raise HTTPException(
                    status_code=403,
                    detail="You can only close your own tickets.",
                )

        # Merge existing resolution fields with incoming so validate_transition sees them
        merged: dict = {}
        if incident.resolution_code:
            merged["resolution_code"] = incident.resolution_code
        if incident.resolution_notes:
            merged["resolution_notes"] = incident.resolution_notes
        if req.resolution_code:
            merged["resolution_code"] = req.resolution_code
        if req.resolution_notes:
            merged["resolution_notes"] = req.resolution_notes

        try:
            validate_transition(incident.state, req.to_state, merged)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

        now = utcnow()
        update_fields: dict = {"state": req.to_state, "updated_at": now}
        if req.resolution_code:
            update_fields["resolution_code"] = req.resolution_code
        if req.resolution_notes:
            update_fields["resolution_notes"] = req.resolution_notes
        if req.to_state == "resolved":
            update_fields["resolved_at"] = now
        if req.to_state == "closed":
            update_fields["closed_at"] = now

        await self._inc.update(incident_id, update_fields)

        await self._evt.create(IncidentEventCreate(
            incident_id=incident_id,
            actor_id=caller.user_id,
            event_type="state_change",
            body=None,
            event_metadata={
                "from_state": incident.state,
                "to_state": req.to_state,
                "resolution_code": merged.get("resolution_code"),
            },
        ))

        return await self._inc.get_by_id(incident_id)

    async def get_incident_detail(self, incident_id: str) -> IncidentDetail:
        incident = await self._inc.get_with_events(incident_id)
        if incident is None:
            raise HTTPException(status_code=404, detail="Incident not found")

        requester = await self._usr.get_by_id(incident.requester_id)
        assignee = (
            await self._usr.get_by_id(incident.assignee_id)
            if incident.assignee_id else None
        )

        events = sorted(incident.events, key=lambda e: e.created_at)[-50:]

        return IncidentDetail(
            id=incident.id,
            number=incident.number,
            title=incident.title,
            description=incident.description,
            state=incident.state,
            priority=incident.priority,
            category=incident.category,
            source=incident.source,
            requester_id=incident.requester_id,
            assignee_id=incident.assignee_id,
            resolution_code=incident.resolution_code,
            resolution_notes=incident.resolution_notes,
            sla_resolution_due=incident.sla_resolution_due,
            sla_breached=incident.sla_breached,
            created_at=incident.created_at,
            updated_at=incident.updated_at,
            resolved_at=incident.resolved_at,
            closed_at=incident.closed_at,
            requester=UserResponse.model_validate(requester),
            assignee=UserResponse.model_validate(assignee) if assignee else None,
            events=[IncidentEventResponse.model_validate(e) for e in events],
        )

    async def check_and_update_sla_breach(self, incident) -> None:
        if incident.sla_breached:
            return
        if incident.state in ("resolved", "closed"):
            return
        if incident.sla_resolution_due is None:
            return
        if incident.sla_resolution_due < utcnow():
            await self._inc.update(incident.id, {
                "sla_breached": True,
                "updated_at": utcnow(),
            })
```

- [ ] **Step 4: Run tests to verify they pass**

```
cd backend
uv run pytest tests/test_incident_service.py tests/test_repositories.py tests/test_auth.py -v
```

Expected: All PASSED.

- [ ] **Step 5: Commit**

```
git add backend/app/services/incident_service.py backend/tests/test_incident_service.py
git commit -m "feat: add IncidentService with create/update/transition/detail/sla_breach"
```

---

## Task 4: All Routers + Updated main.py

**Files:**
- Create: `backend/app/routers/incidents.py`
- Create: `backend/app/routers/events.py`
- Create: `backend/app/routers/attachments.py`
- Create: `backend/app/routers/config.py`
- Create: `backend/app/routers/users.py`
- Create: `backend/app/routers/dashboard.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Create `backend/app/routers/incidents.py`**

```python
from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from ..db import get_db
from ..auth.permissions import require_scope
from ..auth.context import CallerContext
from ..repositories.incident_repository import IncidentRepository
from ..schemas.incident import (
    IncidentCreateRequest, IncidentPatchRequest, TransitionRequest,
    IncidentResponse, IncidentListResponse, IncidentListItem, IncidentDetail,
)
from ..services.incident_service import IncidentService

router = APIRouter(prefix="/api/incidents", tags=["incidents"])


@router.get("", response_model=IncidentListResponse)
async def list_incidents(
    state: str | None = Query(None),
    priority: int | None = Query(None),
    assignee_id: str | None = Query(None),
    requester_id: str | None = Query(None),
    q: str | None = Query(None),
    category: str | None = Query(None),
    sort: str = Query("created_at"),
    order: str = Query("desc"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    caller: CallerContext = require_scope("TicketRead"),
    session: AsyncSession = Depends(get_db),
):
    repo = IncidentRepository(session)
    svc = IncidentService(session)
    offset = (page - 1) * page_size
    items = await repo.list(
        state=state, priority=priority, assignee_id=assignee_id,
        requester_id=requester_id, q=q, category=category,
        sort=sort, order=order, limit=page_size, offset=offset,
    )
    total = await repo.count(
        state=state, priority=priority, assignee_id=assignee_id,
        requester_id=requester_id, q=q, category=category,
    )
    for inc in items:
        await svc.check_and_update_sla_breach(inc)
    return IncidentListResponse(
        items=[IncidentListItem.model_validate(i) for i in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=IncidentResponse, status_code=201)
async def create_incident(
    req: IncidentCreateRequest,
    caller: CallerContext = require_scope("TicketWrite"),
    session: AsyncSession = Depends(get_db),
):
    svc = IncidentService(session)
    incident = await svc.create_incident(req, caller)
    return IncidentResponse.model_validate(incident)


@router.get("/{incident_id}", response_model=IncidentDetail)
async def get_incident(
    incident_id: str,
    caller: CallerContext = require_scope("TicketRead"),
    session: AsyncSession = Depends(get_db),
):
    repo = IncidentRepository(session)
    svc = IncidentService(session)
    incident = await repo.get_by_id(incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    await svc.check_and_update_sla_breach(incident)
    return await svc.get_incident_detail(incident_id)


@router.patch("/{incident_id}", response_model=IncidentResponse)
async def patch_incident(
    incident_id: str,
    req: IncidentPatchRequest,
    caller: CallerContext = require_scope("Agent"),
    session: AsyncSession = Depends(get_db),
):
    svc = IncidentService(session)
    incident = await svc.update_incident(incident_id, req, caller)
    return IncidentResponse.model_validate(incident)


@router.post("/{incident_id}/transition", response_model=IncidentResponse)
async def transition_incident(
    incident_id: str,
    req: TransitionRequest,
    caller: CallerContext = require_scope("TicketWrite"),
    session: AsyncSession = Depends(get_db),
):
    svc = IncidentService(session)
    incident = await svc.transition_incident(incident_id, req, caller)
    return IncidentResponse.model_validate(incident)
```

- [ ] **Step 2: Create `backend/app/routers/events.py`**

```python
from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from ..db import get_db
from ..auth.permissions import require_scope
from ..auth.context import CallerContext
from ..repositories.incident_repository import IncidentRepository
from ..repositories.incident_event_repository import IncidentEventRepository
from ..schemas.incident_event import IncidentEventCreate, IncidentEventResponse, EventCreateRequest

router = APIRouter(prefix="/api/incidents/{incident_id}/events", tags=["events"])


@router.get("")
async def list_events(
    incident_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    caller: CallerContext = require_scope("TicketRead"),
    session: AsyncSession = Depends(get_db),
) -> dict:
    incident = await IncidentRepository(session).get_by_id(incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    repo = IncidentEventRepository(session)
    offset = (page - 1) * page_size
    events = await repo.list_for_incident(incident_id, limit=page_size, offset=offset, order="desc")
    total = await repo.count_for_incident(incident_id)
    return {
        "items": [IncidentEventResponse.model_validate(e) for e in events],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.post("", response_model=IncidentEventResponse, status_code=201)
async def create_event(
    incident_id: str,
    req: EventCreateRequest,
    caller: CallerContext = require_scope("TicketWrite"),
    session: AsyncSession = Depends(get_db),
):
    incident = await IncidentRepository(session).get_by_id(incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    if req.event_type == "work_note" and "Agent" not in caller.scopes:
        raise HTTPException(status_code=403, detail="work_note requires Agent scope")
    repo = IncidentEventRepository(session)
    event = await repo.create(IncidentEventCreate(
        incident_id=incident_id,
        actor_id=caller.user_id,
        event_type=req.event_type,
        body=req.body,
        event_metadata=None,
    ))
    return IncidentEventResponse.model_validate(event)
```

- [ ] **Step 3: Create `backend/app/routers/attachments.py`**

```python
from __future__ import annotations
import uuid
from pathlib import Path
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from ..db import get_db
from ..auth.permissions import require_scope
from ..auth.context import CallerContext
from ..repositories.incident_repository import IncidentRepository
from ..repositories.attachment_repository import AttachmentRepository
from ..repositories.incident_event_repository import IncidentEventRepository
from ..schemas.attachment import AttachmentCreate, AttachmentResponse
from ..schemas.incident_event import IncidentEventCreate

_UPLOAD_DIR = Path("uploads")
_MAX_BYTES = 20 * 1024 * 1024

router = APIRouter(prefix="/api/incidents/{incident_id}/attachments", tags=["attachments"])


@router.post("", response_model=AttachmentResponse, status_code=201)
async def upload_attachment(
    incident_id: str,
    file: UploadFile = File(...),
    caller: CallerContext = require_scope("TicketWrite"),
    session: AsyncSession = Depends(get_db),
):
    incident = await IncidentRepository(session).get_by_id(incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found")

    content = await file.read()
    if len(content) > _MAX_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds 20 MB limit")

    file_uuid = str(uuid.uuid4())
    dest_dir = _UPLOAD_DIR / incident_id
    dest_dir.mkdir(parents=True, exist_ok=True)
    safe_filename = f"{file_uuid}_{Path(file.filename or 'upload').name}"
    dest_path = dest_dir / safe_filename
    dest_path.write_bytes(content)

    att = await AttachmentRepository(session).create(AttachmentCreate(
        incident_id=incident_id,
        filename=file.filename or "upload",
        mime_type=file.content_type or "application/octet-stream",
        size_bytes=len(content),
        blob_ref=str(dest_path),
        uploaded_by=caller.user_id,
    ))

    await IncidentEventRepository(session).create(IncidentEventCreate(
        incident_id=incident_id,
        actor_id=caller.user_id,
        event_type="attachment_added",
        body=None,
        event_metadata={"filename": file.filename, "size_bytes": len(content)},
    ))

    return AttachmentResponse.model_validate(att)


@router.get("/{attachment_id}")
async def download_attachment(
    incident_id: str,
    attachment_id: str,
    caller: CallerContext = require_scope("TicketRead"),
    session: AsyncSession = Depends(get_db),
):
    att = await AttachmentRepository(session).get_by_id(attachment_id)
    if att is None or att.incident_id != incident_id:
        raise HTTPException(status_code=404, detail="Attachment not found")
    path = Path(att.blob_ref)
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")
    return FileResponse(path=str(path), filename=att.filename, media_type=att.mime_type)


@router.delete("/{attachment_id}", status_code=204)
async def delete_attachment(
    incident_id: str,
    attachment_id: str,
    caller: CallerContext = require_scope("Agent"),
    session: AsyncSession = Depends(get_db),
):
    att_repo = AttachmentRepository(session)
    att = await att_repo.get_by_id(attachment_id)
    if att is None or att.incident_id != incident_id:
        raise HTTPException(status_code=404, detail="Attachment not found")

    path = Path(att.blob_ref)
    if path.exists():
        path.unlink()

    await att_repo.delete(attachment_id)

    await IncidentEventRepository(session).create(IncidentEventCreate(
        incident_id=incident_id,
        actor_id=caller.user_id,
        event_type="attachment_deleted",
        body=None,
        event_metadata={"filename": att.filename},
    ))
```

- [ ] **Step 4: Create `backend/app/routers/config.py`**

```python
from __future__ import annotations
from fastapi import APIRouter
from ..auth.permissions import require_scope
from ..auth.context import CallerContext
from ..config import app_config

router = APIRouter(prefix="/api/config", tags=["config"])


@router.get("/priorities")
async def get_priorities(caller: CallerContext = require_scope("TicketRead")) -> list[dict]:
    return [
        {"level": i + 1, "name": p.name, "color": p.color, "sla_hours": p.sla_hours}
        for i, p in enumerate(app_config.priorities)
    ]


@router.get("/categories")
async def get_categories(caller: CallerContext = require_scope("TicketRead")) -> list[str]:
    return app_config.categories


@router.get("/states")
async def get_states(caller: CallerContext = require_scope("TicketRead")) -> dict:
    return {
        "states": app_config.states,
        "transitions": app_config.state_transitions,
    }
```

- [ ] **Step 5: Create `backend/app/routers/users.py`**

```python
from __future__ import annotations
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from ..db import get_db
from ..auth.permissions import require_scope
from ..auth.context import CallerContext
from ..repositories.user_repository import UserRepository
from ..schemas.user import UserResponse

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("", response_model=list[UserResponse])
async def list_users(
    role: str | None = Query(None),
    caller: CallerContext = require_scope("Agent"),
    session: AsyncSession = Depends(get_db),
):
    repo = UserRepository(session)
    users = await repo.list_by_role(role) if role else await repo.list_active()
    return [UserResponse.model_validate(u) for u in users]
```

- [ ] **Step 6: Create `backend/app/routers/dashboard.py`**

```python
from __future__ import annotations
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from ..db import get_db
from ..auth.permissions import require_scope
from ..auth.context import CallerContext
from ..repositories.incident_repository import IncidentRepository

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/summary")
async def get_summary(
    caller: CallerContext = require_scope("TicketRead"),
    session: AsyncSession = Depends(get_db),
) -> dict:
    return await IncidentRepository(session).get_dashboard_summary(caller.user_id)
```

- [ ] **Step 7: Replace `backend/app/main.py`** with all routers wired

```python
from __future__ import annotations
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .config import env_settings
from .routers import session, incidents, events, attachments, config, users, dashboard

app = FastAPI(
    title="ITSM API",
    version="0.1.0",
    description="Single-tenant IT Service Management API",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=env_settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(session.router)
app.include_router(incidents.router)
app.include_router(events.router)
app.include_router(attachments.router)
app.include_router(config.router)
app.include_router(users.router)
app.include_router(dashboard.router)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "version": app.version}
```

- [ ] **Step 8: Smoke-test that the app starts**

```
cd backend
uv run python -c "from app.main import app; print('OK')"
```

Expected: `OK`

- [ ] **Step 9: Run all existing tests**

```
cd backend
uv run pytest tests/ -v
```

Expected: All previously passing tests still pass.

- [ ] **Step 10: Commit**

```
git add backend/app/routers/incidents.py backend/app/routers/events.py backend/app/routers/attachments.py backend/app/routers/config.py backend/app/routers/users.py backend/app/routers/dashboard.py backend/app/main.py
git commit -m "feat: add all API routers (incidents, events, attachments, config, users, dashboard)"
```

---

## Task 5: Comprehensive Incident Route Tests

**Files:**
- Create: `backend/tests/test_routes_incidents.py`

- [ ] **Step 1: Create `backend/tests/test_routes_incidents.py`**

```python
from __future__ import annotations
import pytest
from tests.conftest import _seed_user


# ── Helpers ──────────────────────────────────────────────────────────────────

AGENT_EMAIL = "agent@routes.com"
REQUESTER_EMAIL = "req@routes.com"

AGENT_H = {"X-Fake-User": AGENT_EMAIL}
REQ_H = {"X-Fake-User": REQUESTER_EMAIL}


async def _seed_both(test_db):
    agent = await _seed_user(test_db, AGENT_EMAIL, "Test Agent", "agent")
    req = await _seed_user(test_db, REQUESTER_EMAIL, "Test Requester", "requester")
    return agent, req


async def _create_incident(client, headers, **overrides) -> dict:
    payload = {
        "title": "Test Incident",
        "description": "Something broke",
        "priority": 3,
        "category": "Network",
        "source": "web",
        **overrides,
    }
    resp = await client.post("/api/incidents", json=payload, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _force_state(test_db, incident_id: str, state: str, extra: dict | None = None):
    fields = {"state": state, **(extra or {})}
    async with test_db() as session:
        from app.repositories.incident_repository import IncidentRepository
        await IncidentRepository(session).update(incident_id, fields)
        await session.commit()


# ── Tests ─────────────────────────────────────────────────────────────────────

async def test_create_incident_returns_201(client, test_db):
    await _seed_both(test_db)
    data = await _create_incident(client, AGENT_H)
    assert data["state"] == "new"
    assert data["number"].startswith("INC")
    assert data["priority"] == 3


async def test_create_incident_defaults_requester_to_caller(client, test_db):
    agent, _ = await _seed_both(test_db)
    data = await _create_incident(client, AGENT_H)
    assert data["requester_id"] == agent.id


async def test_create_incident_requires_ticket_write(client, test_db):
    await _seed_both(test_db)
    # Requester has TicketWrite, should succeed
    data = await _create_incident(client, REQ_H)
    assert data["state"] == "new"


async def test_create_incident_no_auth_returns_401(client, test_db):
    resp = await client.post("/api/incidents", json={
        "title": "T", "description": "D", "priority": 2, "category": "Network",
    })
    assert resp.status_code == 401


async def test_create_incident_invalid_priority_returns_422(client, test_db):
    await _seed_both(test_db)
    resp = await client.post("/api/incidents", json={
        "title": "T", "description": "D", "priority": 99, "category": "Network",
    }, headers=AGENT_H)
    assert resp.status_code == 422


async def test_create_incident_invalid_category_returns_422(client, test_db):
    await _seed_both(test_db)
    resp = await client.post("/api/incidents", json={
        "title": "T", "description": "D", "priority": 2, "category": "Fake Category",
    }, headers=AGENT_H)
    assert resp.status_code == 422


async def test_list_incidents_returns_paginated(client, test_db):
    await _seed_both(test_db)
    for i in range(3):
        await _create_incident(client, AGENT_H, title=f"Inc {i}")
    resp = await client.get("/api/incidents?page=1&page_size=2", headers=AGENT_H)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 3
    assert len(data["items"]) == 2
    assert data["page"] == 1
    assert data["page_size"] == 2


async def test_list_incidents_filter_by_state(client, test_db):
    await _seed_both(test_db)
    inc = await _create_incident(client, AGENT_H)
    await _force_state(test_db, inc["id"], "assigned")

    resp = await client.get("/api/incidents?state=assigned", headers=AGENT_H)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["id"] == inc["id"]


async def test_list_incidents_filter_unassigned(client, test_db):
    await _seed_both(test_db)
    unassigned = await _create_incident(client, AGENT_H)
    agent, _ = await _seed_both(test_db)  # already seeded, but we reuse

    resp = await client.get("/api/incidents?assignee_id=unassigned", headers=AGENT_H)
    assert resp.status_code == 200
    data = resp.json()
    assert any(i["id"] == unassigned["id"] for i in data["items"])


async def test_list_incidents_search_by_title(client, test_db):
    await _seed_both(test_db)
    await _create_incident(client, AGENT_H, title="Network is down")
    await _create_incident(client, AGENT_H, title="Printer broken")

    resp = await client.get("/api/incidents?q=network", headers=AGENT_H)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert "Network" in data["items"][0]["title"]


async def test_get_incident_detail_includes_requester(client, test_db):
    agent, _ = await _seed_both(test_db)
    inc = await _create_incident(client, AGENT_H)

    resp = await client.get(f"/api/incidents/{inc['id']}", headers=AGENT_H)
    assert resp.status_code == 200
    data = resp.json()
    assert "requester" in data
    assert data["requester"]["id"] == agent.id
    assert "events" in data
    assert len(data["events"]) >= 1  # at least the creation event


async def test_get_incident_not_found(client, test_db):
    await _seed_both(test_db)
    resp = await client.get("/api/incidents/nonexistent-id", headers=AGENT_H)
    assert resp.status_code == 404


async def test_patch_incident_requires_agent_scope(client, test_db):
    await _seed_both(test_db)
    inc = await _create_incident(client, AGENT_H)

    resp = await client.patch(
        f"/api/incidents/{inc['id']}",
        json={"title": "New Title"},
        headers=REQ_H,
    )
    assert resp.status_code == 403


async def test_patch_incident_updates_fields(client, test_db):
    await _seed_both(test_db)
    inc = await _create_incident(client, AGENT_H)

    resp = await client.patch(
        f"/api/incidents/{inc['id']}",
        json={"title": "Updated Title", "priority": 1},
        headers=AGENT_H,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["title"] == "Updated Title"
    assert data["priority"] == 1


async def test_patch_incident_rejects_state_field(client, test_db):
    await _seed_both(test_db)
    inc = await _create_incident(client, AGENT_H)

    resp = await client.patch(
        f"/api/incidents/{inc['id']}",
        json={"state": "resolved"},
        headers=AGENT_H,
    )
    assert resp.status_code == 422  # extra="forbid" rejects unknown field


async def test_transition_new_to_assigned(client, test_db):
    await _seed_both(test_db)
    inc = await _create_incident(client, AGENT_H)

    resp = await client.post(
        f"/api/incidents/{inc['id']}/transition",
        json={"to_state": "assigned"},
        headers=AGENT_H,
    )
    assert resp.status_code == 200
    assert resp.json()["state"] == "assigned"


async def test_transition_to_resolved_requires_resolution(client, test_db):
    await _seed_both(test_db)
    inc = await _create_incident(client, AGENT_H)
    await _force_state(test_db, inc["id"], "in_progress")

    resp = await client.post(
        f"/api/incidents/{inc['id']}/transition",
        json={"to_state": "resolved"},
        headers=AGENT_H,
    )
    assert resp.status_code == 422


async def test_transition_to_resolved_with_resolution_fields(client, test_db):
    await _seed_both(test_db)
    inc = await _create_incident(client, AGENT_H)
    await _force_state(test_db, inc["id"], "in_progress")

    resp = await client.post(
        f"/api/incidents/{inc['id']}/transition",
        json={"to_state": "resolved", "resolution_code": "fixed", "resolution_notes": "All done"},
        headers=AGENT_H,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["state"] == "resolved"
    assert data["resolved_at"] is not None
    assert data["resolution_code"] == "fixed"


async def test_requester_can_close_own_resolved_ticket(client, test_db):
    agent, req = await _seed_both(test_db)
    inc = await _create_incident(client, AGENT_H, requester_id=req.id)
    await _force_state(test_db, inc["id"], "resolved", {
        "resolution_code": "fixed",
        "resolution_notes": "Done",
    })

    resp = await client.post(
        f"/api/incidents/{inc['id']}/transition",
        json={"to_state": "closed"},
        headers=REQ_H,
    )
    assert resp.status_code == 200
    assert resp.json()["state"] == "closed"


async def test_requester_cannot_close_other_requester_ticket(client, test_db):
    agent, req = await _seed_both(test_db)
    other = await _seed_user(test_db, "other@routes.com", "Other", "requester")
    # Incident owned by req, but other tries to close it
    inc = await _create_incident(client, AGENT_H, requester_id=req.id)
    await _force_state(test_db, inc["id"], "resolved", {
        "resolution_code": "fixed", "resolution_notes": "Done",
    })

    resp = await client.post(
        f"/api/incidents/{inc['id']}/transition",
        json={"to_state": "closed"},
        headers={"X-Fake-User": "other@routes.com"},
    )
    assert resp.status_code == 403


async def test_sla_breach_marked_on_get(client, test_db):
    await _seed_both(test_db)
    inc = await _create_incident(client, AGENT_H)

    # Backdate sla_resolution_due to past
    async with test_db() as session:
        from app.repositories.incident_repository import IncidentRepository
        from app.utils import utcnow
        past = utcnow().replace(year=2020)
        await IncidentRepository(session).update(inc["id"], {"sla_resolution_due": past})
        await session.commit()

    resp = await client.get(f"/api/incidents/{inc['id']}", headers=AGENT_H)
    assert resp.status_code == 200
    assert resp.json()["sla_breached"] is True


async def test_dashboard_summary(client, test_db):
    await _seed_both(test_db)
    await _create_incident(client, AGENT_H)
    resp = await client.get("/api/dashboard/summary", headers=AGENT_H)
    assert resp.status_code == 200
    data = resp.json()
    assert data["all_open"] >= 1
    assert "by_state" in data
    assert "by_priority" in data


async def test_config_priorities(client, test_db):
    await _seed_both(test_db)
    resp = await client.get("/api/config/priorities", headers=AGENT_H)
    assert resp.status_code == 200
    priorities = resp.json()
    assert len(priorities) == 4
    assert priorities[0]["level"] == 1
    assert priorities[0]["name"] == "Critical"


async def test_users_list_requires_agent_scope(client, test_db):
    await _seed_both(test_db)
    resp = await client.get("/api/users", headers=REQ_H)
    assert resp.status_code == 403


async def test_users_list_by_role(client, test_db):
    await _seed_both(test_db)
    resp = await client.get("/api/users?role=agent", headers=AGENT_H)
    assert resp.status_code == 200
    users = resp.json()
    assert all(u["role"] == "agent" for u in users)
```

- [ ] **Step 2: Run the full test suite**

```
cd backend
uv run pytest tests/ -v
```

Expected: All tests PASSED including the ~20 new route tests.

- [ ] **Step 3: Start the dev server and verify manually**

In a separate terminal:

```
cd backend
uv run uvicorn app.main:app --reload
```

Then run this curl script against the live server (requires the dev database to have seeded users from `scripts/seed_dev.py`):

```bash
# 1. Check health
curl http://localhost:8000/health

# 2. Get me (as admin)
curl -H "X-Fake-User: admin@acme.com" http://localhost:8000/api/me

# 3. List incidents
curl -H "X-Fake-User: admin@acme.com" http://localhost:8000/api/incidents

# 4. Create an incident
curl -s -X POST http://localhost:8000/api/incidents \
  -H "X-Fake-User: admin@acme.com" \
  -H "Content-Type: application/json" \
  -d '{"title":"VPN not working","description":"Cannot connect to VPN","priority":2,"category":"Network"}' | python -m json.tool

# 5. Transition new -> assigned (copy ID from step 4)
INCIDENT_ID="<id from step 4>"
curl -s -X POST "http://localhost:8000/api/incidents/$INCIDENT_ID/transition" \
  -H "X-Fake-User: admin@acme.com" \
  -H "Content-Type: application/json" \
  -d '{"to_state":"assigned"}' | python -m json.tool

# 6. Dashboard summary
curl -H "X-Fake-User: admin@acme.com" http://localhost:8000/api/dashboard/summary | python -m json.tool
```

- [ ] **Step 4: Commit**

```
git add backend/tests/test_routes_incidents.py
git commit -m "feat: add comprehensive incident route tests (create/list/patch/transition/sla/dashboard)"
```
