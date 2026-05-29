# Setup Wizard Implementation Plan

> **For agentic workers:** Use subagent-driven-development to implement this plan task-by-task.

**Goal:** Add a first-run setup wizard that bootstraps an ITSM deployment (app_settings table, setup routes, middleware guard, and wizard + settings UI).

**Architecture:** New `app_settings` singleton table, a setup router, a setup-guard middleware that blocks API routes until setup is complete, a multi-step React wizard, and an admin settings page. The middleware uses the FastAPI `get_db` dependency override in tests (so test fixtures control their own DB state) and the real `AsyncSessionLocal` in production.

**Tech Stack:** FastAPI, SQLAlchemy async, Alembic (backend); React, TanStack Query, React Router (frontend).

---

## File Map

### New backend files
- `backend/app/models/app_settings.py` — ORM model (singleton row)
- `backend/app/repositories/app_settings_repository.py` — get/create/update
- `backend/app/schemas/setup.py` — request/response Pydantic models
- `backend/app/routers/setup.py` — 4 routes: setup status, complete, GET settings, PATCH settings
- `backend/app/middleware/__init__.py` — empty init
- `backend/app/middleware/setup_guard.py` — middleware that blocks pre-setup API calls
- `backend/alembic/versions/<id>_add_app_settings.py` — migration (written manually, tbl() everywhere)
- `backend/tests/test_setup.py` — new tests

### Modified backend files
- `backend/app/models/__init__.py` — export AppSettings
- `backend/app/main.py` — register setup router + SetupGuardMiddleware
- `backend/app/repositories/incident_repository.py` — `_sla_due` accepts optional sla_hours dict
- `backend/app/services/incident_service.py` — load app_settings for SLA override + resolution code validation
- `backend/tests/conftest.py` — seed app_settings in `test_db`, add `test_db_fresh` + `client_fresh` fixtures, HANA infra for app_settings

### New frontend files
- `frontend/src/api/setup.ts` — API calls
- `frontend/src/hooks/useSetupStatus.ts` — React Query hook
- `frontend/src/hooks/useAppSettings.ts` — React Query hook
- `frontend/src/pages/Setup.tsx` — 6-step wizard
- `frontend/src/pages/AppSettings.tsx` — admin settings form

### Modified frontend files
- `frontend/src/router.tsx` — add /setup, RequireSetup guard, move appearance to /settings/appearance
- `frontend/src/components/Layout.tsx` — company name from API, update nav links
- `frontend/src/pages/Login.tsx` — redirect to /setup if not setup

---

## Task 1: AppSettings ORM model + Alembic migration

**Files:**
- Create: `backend/app/models/app_settings.py`
- Modify: `backend/app/models/__init__.py`
- Create: `backend/alembic/versions/<id>_add_app_settings.py`

- [ ] **Step 1: Write the model**

```python
# backend/app/models/app_settings.py
from __future__ import annotations
from datetime import datetime
from sqlalchemy import String, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from ..db import Base
from ..config import tbl
from ..types import JSONText
from ..utils import utcnow


class AppSettings(Base):
    __tablename__ = tbl("app_settings")

    id: Mapped[str] = mapped_column(String(16), primary_key=True, default=lambda: "singleton")
    company_name: Mapped[str] = mapped_column(String(255), nullable=False)
    timezone: Mapped[str] = mapped_column(String(100), nullable=False)
    sla_targets: Mapped[dict | None] = mapped_column(JSONText, nullable=True)
    resolution_codes: Mapped[list | None] = mapped_column(JSONText, nullable=True)
    setup_completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    setup_completed_by: Mapped[str | None] = mapped_column(
        String(36), ForeignKey(tbl("users") + ".id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)
```

- [ ] **Step 2: Update models/__init__.py**

Add `from .app_settings import AppSettings` and include `AppSettings` in `__all__`.

- [ ] **Step 3: Write the migration manually**

Run `uv run alembic revision -m "add_app_settings"` to get a revision ID, then replace the content with:

```python
"""add_app_settings
...
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from app.config import tbl
from app.types import JSONText

revision: str = '<generated-id>'
down_revision: Union[str, Sequence[str], None] = '1662b6fded47'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        tbl('app_settings'),
        sa.Column('id', sa.String(length=16), nullable=False),
        sa.Column('company_name', sa.String(length=255), nullable=False),
        sa.Column('timezone', sa.String(length=100), nullable=False),
        sa.Column('sla_targets', JSONText(), nullable=True),
        sa.Column('resolution_codes', JSONText(), nullable=True),
        sa.Column('setup_completed_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('setup_completed_by', sa.String(length=36), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ['setup_completed_by'], [f"{tbl('users')}.id"],
            name=f"fk_{tbl('app_settings')}_setup_completed_by_{tbl('users')}"
        ),
        sa.PrimaryKeyConstraint('id', name=f"pk_{tbl('app_settings')}")
    )


def downgrade() -> None:
    op.drop_table(tbl('app_settings'))
```

- [ ] **Step 4: Run migration and verify**

```bash
cd backend
uv run alembic upgrade head
```

Expected: migration runs without error, `app_settings` table exists.

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/app_settings.py backend/app/models/__init__.py backend/alembic/versions/
git commit -m "feat: add app_settings model and migration"
```

---

## Task 2: AppSettingsRepository

**Files:**
- Create: `backend/app/repositories/app_settings_repository.py`

- [ ] **Step 1: Write the repository**

```python
# backend/app/repositories/app_settings_repository.py
from __future__ import annotations
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from ..models.app_settings import AppSettings
from ..utils import utcnow


class AppSettingsRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get(self) -> AppSettings | None:
        result = await self.session.execute(
            select(AppSettings).where(AppSettings.id == "singleton")
        )
        return result.scalar_one_or_none()

    async def create(self, data: dict) -> AppSettings:
        settings = AppSettings(id="singleton", **data)
        self.session.add(settings)
        await self.session.flush()
        return settings

    async def update(self, fields: dict) -> AppSettings | None:
        settings = await self.get()
        if settings is None:
            return None
        for k, v in fields.items():
            setattr(settings, k, v)
        settings.updated_at = utcnow()
        await self.session.flush()
        return settings
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/repositories/app_settings_repository.py
git commit -m "feat: add AppSettingsRepository"
```

---

## Task 3: Setup schemas + router

**Files:**
- Create: `backend/app/schemas/setup.py`
- Create: `backend/app/routers/setup.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Write schemas**

```python
# backend/app/schemas/setup.py
from __future__ import annotations
from datetime import datetime
from pydantic import BaseModel, EmailStr, field_validator


class AdminBootstrap(BaseModel):
    name: str
    email: EmailStr


class SetupCompleteRequest(BaseModel):
    company_name: str
    timezone: str
    admin: AdminBootstrap
    sla_targets: dict[str, int]  # {"1": 4, "2": 8, "3": 24, "4": 72}
    resolution_codes: list[str]

    @field_validator("company_name")
    @classmethod
    def company_name_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("company_name cannot be empty")
        return v.strip()

    @field_validator("sla_targets")
    @classmethod
    def sla_targets_positive(cls, v: dict) -> dict:
        for k, hours in v.items():
            if not isinstance(hours, int) or hours <= 0:
                raise ValueError(f"sla_targets[{k}] must be a positive integer")
        return v

    @field_validator("resolution_codes")
    @classmethod
    def resolution_codes_non_empty(cls, v: list) -> list:
        codes = [c.strip() for c in v if c.strip()]
        if not codes:
            raise ValueError("resolution_codes must contain at least one entry")
        return codes


class AppSettingsPatch(BaseModel):
    company_name: str | None = None
    timezone: str | None = None
    sla_targets: dict[str, int] | None = None
    resolution_codes: list[str] | None = None


class AppSettingsResponse(BaseModel):
    id: str
    company_name: str
    timezone: str
    sla_targets: dict | None
    resolution_codes: list | None
    setup_completed_at: datetime
    setup_completed_by: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
```

- [ ] **Step 2: Write the router**

```python
# backend/app/routers/setup.py
from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from ..db import get_db
from ..auth.permissions import require_scope
from ..auth.context import CallerContext
from ..repositories.app_settings_repository import AppSettingsRepository
from ..repositories.user_repository import UserRepository
from ..schemas.setup import SetupCompleteRequest, AppSettingsPatch, AppSettingsResponse
from ..schemas.user import UserCreate, UserResponse
from ..utils import utcnow

router = APIRouter(prefix="/api", tags=["setup"])

_DEFAULT_RESOLUTION_CODES = [
    "Fixed", "Workaround", "No Fault Found", "User Error", "Duplicate", "Cannot Reproduce"
]


@router.get("/setup/status")
async def get_setup_status(session: AsyncSession = Depends(get_db)) -> dict:
    settings = await AppSettingsRepository(session).get()
    return {
        "completed": settings is not None,
        "company_name": settings.company_name if settings else None,
    }


@router.post("/setup/complete", status_code=200)
async def complete_setup(
    req: SetupCompleteRequest,
    session: AsyncSession = Depends(get_db),
) -> dict:
    repo = AppSettingsRepository(session)
    if await repo.get() is not None:
        raise HTTPException(status_code=409, detail="Setup already completed")

    user_repo = UserRepository(session)
    admin = await user_repo.create(UserCreate(
        name=req.admin.name,
        email=req.admin.email,
        role="admin",
    ))

    now = utcnow()
    await repo.create({
        "company_name": req.company_name,
        "timezone": req.timezone,
        "sla_targets": req.sla_targets,
        "resolution_codes": req.resolution_codes,
        "setup_completed_at": now,
        "setup_completed_by": admin.id,
        "created_at": now,
        "updated_at": now,
    })

    return {
        "completed": True,
        "admin": UserResponse.model_validate(admin).model_dump(),
    }


@router.get("/settings", response_model=AppSettingsResponse)
async def get_settings(
    caller: CallerContext = require_scope("TicketRead"),
    session: AsyncSession = Depends(get_db),
):
    settings = await AppSettingsRepository(session).get()
    if settings is None:
        raise HTTPException(status_code=404, detail="App not yet configured")
    return settings


@router.patch("/settings", response_model=AppSettingsResponse)
async def patch_settings(
    req: AppSettingsPatch,
    caller: CallerContext = require_scope("Admin"),
    session: AsyncSession = Depends(get_db),
):
    repo = AppSettingsRepository(session)
    fields = req.model_dump(exclude_none=True)
    if not fields:
        settings = await repo.get()
        if settings is None:
            raise HTTPException(status_code=404, detail="App not yet configured")
        return settings
    settings = await repo.update(fields)
    if settings is None:
        raise HTTPException(status_code=404, detail="App not yet configured")
    return settings
```

- [ ] **Step 3: Register in main.py**

In `backend/app/main.py`, add:
```python
from .routers import session, incidents, events, attachments, config, users, dashboard, setup
# ...
app.include_router(setup.router)
```

- [ ] **Step 4: Run existing tests to confirm no regression**

```bash
cd backend
uv run pytest tests/ -v --tb=short -x
```

Expected: all 102 tests pass (middleware not yet added).

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas/setup.py backend/app/routers/setup.py backend/app/main.py
git commit -m "feat: add setup/settings routes"
```

---

## Task 4: Setup-guard middleware

**Files:**
- Create: `backend/app/middleware/__init__.py`
- Create: `backend/app/middleware/setup_guard.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Write the middleware**

```python
# backend/app/middleware/setup_guard.py
from __future__ import annotations
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from ..db import get_db, AsyncSessionLocal
from ..repositories.app_settings_repository import AppSettingsRepository

_ALLOWED_PREFIXES = ("/api/setup/", "/api/config/", "/api/health", "/health")


class SetupGuardMiddleware(BaseHTTPMiddleware):
    """Block all /api/* requests (except setup/config/health) until setup is complete.

    In test mode (get_db is overridden in dependency_overrides), check the
    test's own DB on every request without caching. In production, cache
    True permanently once setup is confirmed.
    """

    def __init__(self, app) -> None:
        super().__init__(app)
        self._done: bool = False

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if self._done:
            return await call_next(request)

        path = request.url.path
        if any(path.startswith(p) for p in _ALLOWED_PREFIXES):
            return await call_next(request)

        override = request.app.dependency_overrides.get(get_db)
        if override is not None:
            configured = await _check_with_override(override)
        else:
            try:
                async with AsyncSessionLocal() as session:
                    configured = await AppSettingsRepository(session).get() is not None
            except Exception:
                configured = False
            if configured:
                self._done = True

        if configured:
            return await call_next(request)

        if path.startswith("/api/"):
            return JSONResponse(
                status_code=503,
                content={"detail": "Setup required", "redirect": "/setup"},
            )
        return await call_next(request)


async def _check_with_override(override) -> bool:
    gen = override()
    try:
        session = await gen.__anext__()
        return await AppSettingsRepository(session).get() is not None
    except StopAsyncIteration:
        return False
    finally:
        try:
            await gen.aclose()
        except Exception:
            pass
```

Create `backend/app/middleware/__init__.py` as empty file.

- [ ] **Step 2: Add middleware to main.py**

In `backend/app/main.py`:
```python
from .middleware.setup_guard import SetupGuardMiddleware
# After CORS middleware:
app.add_middleware(SetupGuardMiddleware)
```

**Important**: Starlette applies middleware in reverse order. Add SetupGuardMiddleware AFTER CORSMiddleware so CORS runs first.

- [ ] **Step 3: Update conftest.py — seed app_settings in test_db**

The middleware uses the `get_db` override in tests, checking that test's DB. Existing tests use `test_db` which needs a seeded app_settings row or the middleware will return 503 for all API calls.

In `conftest.py`, modify the `test_db` fixture to seed app_settings:

**SQLite path** (inside the `if not env_settings.hana_test:` block):
```python
    # Seed app_settings so middleware passes through for all existing tests
    from app.models.app_settings import AppSettings
    from app.utils import utcnow as _utcnow
    factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    async with factory() as _s:
        _s.add(AppSettings(
            id="singleton",
            company_name="Test Corp",
            timezone="UTC",
            sla_targets={"1": 4, "2": 8, "3": 24, "4": 72},
            resolution_codes=["Fixed", "Workaround", "No Fault Found", "User Error", "Duplicate"],
            setup_completed_at=_utcnow(),
            setup_completed_by=None,
            created_at=_utcnow(),
            updated_at=_utcnow(),
        ))
        await _s.commit()
    yield factory
    # cleanup unchanged
```

**HANA path** — add synchronous seeding before yield:
```python
    # Seed app_settings synchronously (HANA has no async engine)
    _seed_hana_app_settings(hana_engine)
    yield _HANASessionMaker(sync_factory)
    _truncate_hana_test_tables(hana_engine)
```

Add helper:
```python
def _seed_hana_app_settings(engine) -> None:
    from app.config import tbl as _tbl
    from sqlalchemy import text as _text
    import json
    sla = json.dumps({"1": 4, "2": 8, "3": 24, "4": 72})
    codes = json.dumps(["Fixed", "Workaround", "No Fault Found", "User Error", "Duplicate"])
    with engine.connect() as conn:
        conn.execute(_text(
            f'INSERT INTO "{_tbl("app_settings")}" '
            f'(id, company_name, timezone, sla_targets, resolution_codes, '
            f' setup_completed_at, created_at, updated_at) '
            f'VALUES (:id, :cn, :tz, :sla, :codes, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)'
        ), {"id": "singleton", "cn": "Test Corp", "tz": "UTC", "sla": sla, "codes": codes})
        conn.commit()
```

- [ ] **Step 4: Add test_db_fresh and client_fresh fixtures**

These are used by test_setup.py for tests that need an unconfigured app state (to test 503 behavior):

```python
@pytest_asyncio.fixture
async def test_db_fresh():
    """Like test_db but without app_settings seeded — for setup wizard tests."""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    yield factory
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def client_fresh(test_db_fresh):
    """HTTP test client backed by an unconfigured (no app_settings) DB."""
    from app.main import app

    async def override_get_db():
        async with test_db_fresh() as session:
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

- [ ] **Step 5: Add app_settings to HANA base tables list**

In conftest.py, change:
```python
_HANA_BASE_TABLES = ["incident_events", "attachments", "incidents", "users"]
```
to:
```python
_HANA_BASE_TABLES = ["incident_events", "attachments", "incidents", "app_settings", "users"]
```

(app_settings has FK to users, so it's a child — delete before users)

- [ ] **Step 6: Run all existing tests to confirm no regression**

```bash
uv run pytest tests/ -v --tb=short
```

Expected: 102 passed.

- [ ] **Step 7: Commit**

```bash
git add backend/app/middleware/ backend/app/main.py backend/tests/conftest.py
git commit -m "feat: setup-guard middleware + test fixture updates"
```

---

## Task 5: SLA override + resolution code validation

**Files:**
- Modify: `backend/app/repositories/incident_repository.py`
- Modify: `backend/app/services/incident_service.py`

- [ ] **Step 1: Modify `_sla_due` to accept optional sla_targets dict**

In `incident_repository.py`, change `_sla_due`:
```python
def _sla_due(priority: int, created_at: datetime, sla_targets: dict | None = None) -> datetime:
    if sla_targets is not None:
        hours = sla_targets.get(str(priority))
        if hours is None:
            # priority not in app_settings, fall back to config
            hours = app_config.priorities[priority - 1].sla_hours
    else:
        hours = app_config.priorities[priority - 1].sla_hours
    return created_at + timedelta(hours=hours)
```

Also update `IncidentRepository.create()` to accept optional `sla_targets`:
```python
async def create(self, data: IncidentCreate, sla_targets: dict | None = None) -> Incident:
    now = utcnow()
    number = await next_incident_number(self.session)
    incident = Incident(
        ...
        sla_resolution_due=_sla_due(data.priority, now, sla_targets),
        ...
    )
```

- [ ] **Step 2: Update IncidentService to load app_settings**

In `incident_service.py`, add import:
```python
from ..repositories.app_settings_repository import AppSettingsRepository
```

Add helper method:
```python
async def _get_sla_targets(self) -> dict | None:
    settings = await AppSettingsRepository(self.session).get()
    return settings.sla_targets if settings else None
```

Update `create_incident`:
```python
async def create_incident(self, req: IncidentCreateRequest, caller: CallerContext):
    sla_targets = await self._get_sla_targets()
    # ... existing code ...
    incident = await self._inc.create(create_data, sla_targets)
    # ...
```

Update `update_incident` where priority changes:
```python
if "priority" in changed:
    sla_targets = await self._get_sla_targets()
    fields["sla_resolution_due"] = _sla_due(fields["priority"], incident.created_at, sla_targets)
```

- [ ] **Step 3: Add resolution code validation in transition_incident**

In `incident_service.py`, after `validate_transition()` and before update:
```python
_DEFAULT_RESOLUTION_CODES = [
    "Fixed", "Workaround", "No Fault Found", "User Error", "Duplicate", "Cannot Reproduce"
]

# In transition_incident, after validate_transition():
if req.to_state == "resolved":
    settings = await AppSettingsRepository(self.session).get()
    allowed_codes = (
        settings.resolution_codes
        if settings and settings.resolution_codes
        else _DEFAULT_RESOLUTION_CODES
    )
    code = merged.get("resolution_code", "")
    if code not in allowed_codes:
        raise HTTPException(
            status_code=422,
            detail=f"resolution_code must be one of: {', '.join(allowed_codes)}",
        )
```

- [ ] **Step 4: Run tests to confirm no regression**

```bash
uv run pytest tests/ -v --tb=short
```

Expected: 102 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/repositories/incident_repository.py backend/app/services/incident_service.py
git commit -m "feat: SLA override from app_settings + resolution code validation"
```

---

## Task 6: New backend tests (test_setup.py)

**Files:**
- Create: `backend/tests/test_setup.py`

- [ ] **Step 1: Write tests**

```python
# backend/tests/test_setup.py
from __future__ import annotations
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.db import Base, get_db
from app.models.app_settings import AppSettings
from app.utils import utcnow
import app.models  # noqa: F401

VALID_SETUP_PAYLOAD = {
    "company_name": "Test Corp",
    "timezone": "America/New_York",
    "admin": {"name": "Alice Admin", "email": "alice@test.com"},
    "sla_targets": {"1": 4, "2": 8, "3": 24, "4": 72},
    "resolution_codes": ["Fixed", "Workaround", "Cannot Reproduce"],
}


async def test_setup_status_before_setup(client_fresh):
    r = await client_fresh.get("/api/setup/status")
    assert r.status_code == 200
    assert r.json() == {"completed": False, "company_name": None}


async def test_complete_setup_creates_admin_and_settings(client_fresh):
    r = await client_fresh.post("/api/setup/complete", json=VALID_SETUP_PAYLOAD)
    assert r.status_code == 200
    body = r.json()
    assert body["completed"] is True
    assert body["admin"]["email"] == "alice@test.com"
    assert body["admin"]["role"] == "admin"


async def test_complete_setup_second_time_returns_409(client_fresh):
    await client_fresh.post("/api/setup/complete", json=VALID_SETUP_PAYLOAD)
    r = await client_fresh.post("/api/setup/complete", json=VALID_SETUP_PAYLOAD)
    assert r.status_code == 409


async def test_setup_status_after_setup(client_fresh):
    await client_fresh.post("/api/setup/complete", json=VALID_SETUP_PAYLOAD)
    r = await client_fresh.get("/api/setup/status")
    assert r.status_code == 200
    data = r.json()
    assert data["completed"] is True
    assert data["company_name"] == "Test Corp"


async def test_api_call_when_not_setup_returns_503(client_fresh):
    r = await client_fresh.get("/api/incidents")
    assert r.status_code == 503
    assert r.json()["detail"] == "Setup required"
    assert r.json()["redirect"] == "/setup"


async def test_api_call_after_setup_passes_through(client_fresh):
    await client_fresh.post("/api/setup/complete", json=VALID_SETUP_PAYLOAD)
    # After setup, /api/incidents should not return 503
    # (may return 401/403 due to no auth, but not 503)
    r = await client_fresh.get("/api/incidents")
    assert r.status_code != 503


async def test_patch_settings_as_non_admin_returns_403(client):
    r = await client.patch(
        "/api/settings",
        json={"company_name": "Evil Corp"},
        headers={"X-Fake-User": "james.park@acme.com"},  # requester role
    )
    assert r.status_code == 403


async def test_patch_settings_as_admin_updates(client):
    r = await client.patch(
        "/api/settings",
        json={"company_name": "Renamed Corp", "timezone": "Europe/London"},
        headers={"X-Fake-User": "admin@acme.com"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["company_name"] == "Renamed Corp"
    assert body["timezone"] == "Europe/London"


async def test_sla_override_from_app_settings(client):
    """When app_settings.sla_targets has priority 1 = 2 hours, created incident uses 2h SLA."""
    # Update sla_targets via PATCH /api/settings
    await client.patch(
        "/api/settings",
        json={"sla_targets": {"1": 2, "2": 8, "3": 24, "4": 72}},
        headers={"X-Fake-User": "admin@acme.com"},
    )
    r = await client.post(
        "/api/incidents",
        json={
            "title": "SLA Test",
            "description": "checking SLA override",
            "priority": 1,
            "category": "Network",
            "source": "web",
        },
        headers={"X-Fake-User": "sarah.chen@acme.com"},
    )
    assert r.status_code == 201
    # sla_resolution_due should be ~2 hours from now (not 4 from config.yaml)
    from datetime import datetime, timedelta, timezone
    due = datetime.fromisoformat(r.json()["sla_resolution_due"].replace("Z", "+00:00"))
    now = datetime.now(timezone.utc)
    diff_hours = (due - now).total_seconds() / 3600
    # Should be about 2h, definitely less than 3.5h (not the 4h config default)
    assert diff_hours < 3.5, f"Expected ~2h SLA, got {diff_hours:.1f}h"


async def test_resolution_code_validated_against_app_settings(client):
    """Resolution codes not in app_settings.resolution_codes are rejected."""
    # First set resolution_codes in app_settings
    await client.patch(
        "/api/settings",
        json={"resolution_codes": ["Fixed", "Workaround"]},
        headers={"X-Fake-User": "admin@acme.com"},
    )
    # Create + assign + in_progress an incident
    r = await client.post(
        "/api/incidents",
        json={"title": "T", "description": "D", "priority": 2, "category": "Network", "source": "web"},
        headers={"X-Fake-User": "sarah.chen@acme.com"},
    )
    inc_id = r.json()["id"]
    await client.post(f"/api/incidents/{inc_id}/transition",
        json={"to_state": "assigned", "assignee_id": "sarah-id"},
        headers={"X-Fake-User": "sarah.chen@acme.com"})
    await client.post(f"/api/incidents/{inc_id}/transition",
        json={"to_state": "in_progress"},
        headers={"X-Fake-User": "sarah.chen@acme.com"})
    
    # Try to resolve with invalid code
    r = await client.post(
        f"/api/incidents/{inc_id}/transition",
        json={"to_state": "resolved", "resolution_code": "Unknown Code", "resolution_notes": "done"},
        headers={"X-Fake-User": "sarah.chen@acme.com"},
    )
    assert r.status_code == 422

    # Resolve with valid code
    r = await client.post(
        f"/api/incidents/{inc_id}/transition",
        json={"to_state": "resolved", "resolution_code": "Fixed", "resolution_notes": "done"},
        headers={"X-Fake-User": "sarah.chen@acme.com"},
    )
    assert r.status_code == 200
```

- [ ] **Step 2: Run the new tests**

```bash
uv run pytest tests/test_setup.py -v --tb=short
```

Expected: all tests pass.

- [ ] **Step 3: Run full test suite**

```bash
uv run pytest tests/ -v --tb=short
```

Expected: 112+ tests all pass.

- [ ] **Step 4: Commit**

```bash
git add backend/tests/test_setup.py
git commit -m "test: setup wizard routes and middleware"
```

---

## Task 7: Frontend API client + hooks

**Files:**
- Create: `frontend/src/api/setup.ts`
- Create: `frontend/src/hooks/useSetupStatus.ts`
- Create: `frontend/src/hooks/useAppSettings.ts`

- [ ] **Step 1: Write setup API module**

```typescript
// frontend/src/api/setup.ts
import client from './client'

export interface SetupStatus {
  completed: boolean
  company_name: string | null
}

export interface AdminBootstrap {
  name: string
  email: string
}

export interface SetupCompleteRequest {
  company_name: string
  timezone: string
  admin: AdminBootstrap
  sla_targets: Record<string, number>
  resolution_codes: string[]
}

export interface AppSettings {
  id: string
  company_name: string
  timezone: string
  sla_targets: Record<string, number> | null
  resolution_codes: string[] | null
  setup_completed_at: string
  setup_completed_by: string | null
  created_at: string
  updated_at: string
}

export interface AppSettingsPatch {
  company_name?: string
  timezone?: string
  sla_targets?: Record<string, number>
  resolution_codes?: string[]
}

export async function getSetupStatus(): Promise<SetupStatus> {
  const r = await client.get<SetupStatus>('/setup/status')
  return r.data
}

export async function completeSetup(req: SetupCompleteRequest): Promise<{ completed: boolean; admin: { id: string; email: string; name: string; role: string } }> {
  const r = await client.post('/setup/complete', req)
  return r.data
}

export async function getAppSettings(): Promise<AppSettings> {
  const r = await client.get<AppSettings>('/settings')
  return r.data
}

export async function patchAppSettings(fields: AppSettingsPatch): Promise<AppSettings> {
  const r = await client.patch<AppSettings>('/settings', fields)
  return r.data
}
```

- [ ] **Step 2: Write hooks**

```typescript
// frontend/src/hooks/useSetupStatus.ts
import { useQuery } from '@tanstack/react-query'
import { getSetupStatus } from '@/api/setup'

export function useSetupStatus() {
  return useQuery({
    queryKey: ['setup-status'],
    queryFn: getSetupStatus,
    staleTime: Infinity,
    retry: false,
  })
}
```

```typescript
// frontend/src/hooks/useAppSettings.ts
import { useQuery } from '@tanstack/react-query'
import { getAppSettings } from '@/api/setup'

export function useAppSettings() {
  return useQuery({
    queryKey: ['app-settings'],
    queryFn: getAppSettings,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/setup.ts frontend/src/hooks/useSetupStatus.ts frontend/src/hooks/useAppSettings.ts
git commit -m "feat: setup API client and hooks"
```

---

## Task 8: Setup wizard page (6 steps)

**Files:**
- Create: `frontend/src/pages/Setup.tsx`

- [ ] **Step 1: Write the wizard**

The wizard manages local state for all steps. Uses `GET /api/config/priorities` (no auth required since allowed by middleware) to get priority names and default SLA hours.

Key patterns from the codebase:
- `border border-surface-200`, `bg-white`, `text-xs`, `text-surface-*` for styling
- `borderRadius: 3` for cards, `borderRadius: 2` for inputs/buttons
- Dense, compact UI — no large padding

```tsx
// frontend/src/pages/Setup.tsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { completeSetup } from '@/api/setup'
import client from '@/api/client'
import { setFakeUser } from '@/api/auth'
import { ChevronRight, ChevronLeft, Check, X, Plus } from 'lucide-react'

interface Priority { level: number; name: string; sla_hours: number }

const DEFAULT_RESOLUTION_CODES = [
  'Fixed', 'Workaround', 'No Fault Found', 'User Error', 'Duplicate', 'Cannot Reproduce',
]

const TIMEZONES: string[] = (Intl as any).supportedValuesOf?.('timeZone') ?? [
  'UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Asia/Tokyo', 'Asia/Singapore',
  'Australia/Sydney',
]

interface WizardState {
  companyName: string
  timezone: string
  adminName: string
  adminEmail: string
  slaTargets: Record<string, number>
  resolutionCodes: string[]
}

export default function Setup() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [step, setStep] = useState(1)
  const [priorities, setPriorities] = useState<Priority[]>([])
  const [newCode, setNewCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<WizardState>({
    companyName: '',
    timezone: typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC',
    adminName: '',
    adminEmail: '',
    slaTargets: { '1': 4, '2': 8, '3': 24, '4': 72 },
    resolutionCodes: [...DEFAULT_RESOLUTION_CODES],
  })

  useEffect(() => {
    client.get<Priority[]>('/config/priorities').then(r => {
      setPriorities(r.data)
      const defaults: Record<string, number> = {}
      r.data.forEach(p => { defaults[String(p.level)] = p.sla_hours })
      setForm(f => ({ ...f, slaTargets: defaults }))
    }).catch(() => {})
  }, [])

  // Check if already setup
  useEffect(() => {
    client.get('/setup/status').then(r => {
      if (r.data.completed) navigate('/incidents', { replace: true })
    }).catch(() => {})
  }, [navigate])

  const TOTAL_STEPS = 6

  function next() { setStep(s => Math.min(s + 1, TOTAL_STEPS)) }
  function back() { setStep(s => Math.max(s - 1, 1)) }

  function removeCode(idx: number) {
    setForm(f => ({ ...f, resolutionCodes: f.resolutionCodes.filter((_, i) => i !== idx) }))
  }

  function addCode() {
    const c = newCode.trim()
    if (c && !form.resolutionCodes.includes(c)) {
      setForm(f => ({ ...f, resolutionCodes: [...f.resolutionCodes, c] }))
    }
    setNewCode('')
  }

  async function submit() {
    setSubmitting(true)
    setError(null)
    try {
      const result = await completeSetup({
        company_name: form.companyName,
        timezone: form.timezone,
        admin: { name: form.adminName, email: form.adminEmail },
        sla_targets: form.slaTargets,
        resolution_codes: form.resolutionCodes,
      })
      setFakeUser(result.admin.email)
      qc.invalidateQueries({ queryKey: ['setup-status'] })
      navigate('/incidents', { replace: true })
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'An error occurred. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // Step validation
  function canProceed(): boolean {
    if (step === 2) return form.companyName.trim().length > 0
    if (step === 3) return form.adminName.trim().length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.adminEmail)
    if (step === 4) return Object.values(form.slaTargets).every(v => v > 0)
    if (step === 5) return form.resolutionCodes.length > 0
    return true
  }

  const inputCls = 'w-full border border-surface-200 bg-white text-xs px-2 py-1.5 focus:outline-none focus:border-surface-400'

  return (
    <div className="min-h-screen bg-surface-50 flex items-center justify-center" style={{ padding: '40px 16px' }}>
      <div className="bg-white border border-surface-200 w-full" style={{ maxWidth: 520, borderRadius: 3 }}>

        {/* Progress bar */}
        <div className="px-6 pt-5 pb-0">
          <div className="flex items-center gap-1 mb-5">
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
              <div
                key={i}
                className="flex-1 h-1 rounded-full transition-colors"
                style={{ background: i < step ? 'var(--text-primary)' : 'var(--border-color)' }}
              />
            ))}
          </div>
          <div className="text-2xs text-surface-400 uppercase tracking-widest mb-1">
            Step {step} of {TOTAL_STEPS}
          </div>
        </div>

        <div className="px-6 pb-6 pt-2" style={{ minHeight: 280 }}>

          {/* Step 1: Welcome */}
          {step === 1 && (
            <div>
              <h1 className="text-base font-semibold text-surface-800 mb-2" style={{ fontSize: 16 }}>
                Welcome to ITSM
              </h1>
              <p className="text-xs text-surface-500 mb-6" style={{ lineHeight: 1.6 }}>
                Let's get your instance set up. This takes about 3 minutes.<br />
                You'll configure your company info, create the first admin account, and set SLA targets.
              </p>
              <button
                onClick={next}
                className="bg-surface-800 text-white text-xs font-medium px-4 py-2 hover:bg-surface-700 transition-colors"
                style={{ borderRadius: 2 }}
              >
                Get Started
              </button>
            </div>
          )}

          {/* Step 2: Company info */}
          {step === 2 && (
            <div>
              <h2 className="text-sm font-semibold text-surface-800 mb-4">Company information</h2>
              <div className="mb-3">
                <label className="block text-xs font-medium text-surface-600 mb-1">Company name *</label>
                <input
                  type="text"
                  value={form.companyName}
                  onChange={e => setForm(f => ({ ...f, companyName: e.target.value }))}
                  placeholder="Acme Corporation"
                  className={inputCls}
                  style={{ borderRadius: 2 }}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-surface-600 mb-1">Timezone *</label>
                <select
                  value={form.timezone}
                  onChange={e => setForm(f => ({ ...f, timezone: e.target.value }))}
                  className={inputCls}
                  style={{ borderRadius: 2 }}
                >
                  {TIMEZONES.map(tz => (
                    <option key={tz} value={tz}>{tz}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Step 3: Admin user */}
          {step === 3 && (
            <div>
              <h2 className="text-sm font-semibold text-surface-800 mb-1">Admin account</h2>
              <p className="text-xs text-surface-400 mb-4" style={{ lineHeight: 1.6 }}>
                This account becomes the first admin. You can invite more users from Settings later.
              </p>
              <div className="mb-3">
                <label className="block text-xs font-medium text-surface-600 mb-1">Your name *</label>
                <input
                  type="text"
                  value={form.adminName}
                  onChange={e => setForm(f => ({ ...f, adminName: e.target.value }))}
                  placeholder="Alex Admin"
                  className={inputCls}
                  style={{ borderRadius: 2 }}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-surface-600 mb-1">Email address *</label>
                <input
                  type="email"
                  value={form.adminEmail}
                  onChange={e => setForm(f => ({ ...f, adminEmail: e.target.value }))}
                  placeholder="admin@company.com"
                  className={inputCls}
                  style={{ borderRadius: 2 }}
                />
              </div>
            </div>
          )}

          {/* Step 4: SLA targets */}
          {step === 4 && (
            <div>
              <h2 className="text-sm font-semibold text-surface-800 mb-1">SLA targets</h2>
              <p className="text-xs text-surface-400 mb-4">Resolution time targets per priority level.</p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-surface-200">
                    <th className="text-left pb-2 text-surface-500 font-medium">Priority</th>
                    <th className="text-right pb-2 text-surface-500 font-medium">Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {[1, 2, 3, 4].map(level => {
                    const p = priorities.find(x => x.level === level)
                    return (
                      <tr key={level} className="border-b border-surface-100">
                        <td className="py-2 text-surface-700">
                          P{level}{p ? ` – ${p.name}` : ''}
                        </td>
                        <td className="py-2">
                          <input
                            type="number"
                            min={1}
                            value={form.slaTargets[String(level)] ?? ''}
                            onChange={e => setForm(f => ({
                              ...f,
                              slaTargets: { ...f.slaTargets, [String(level)]: Number(e.target.value) }
                            }))}
                            className="border border-surface-200 bg-white text-xs px-2 py-1 focus:outline-none focus:border-surface-400 text-right"
                            style={{ borderRadius: 2, width: 72 }}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Step 5: Resolution codes */}
          {step === 5 && (
            <div>
              <h2 className="text-sm font-semibold text-surface-800 mb-1">Resolution codes</h2>
              <p className="text-xs text-surface-400 mb-3">
                Codes agents select when resolving an incident. At least one required.
              </p>
              <div className="flex flex-col gap-1 mb-3">
                {form.resolutionCodes.map((code, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between border border-surface-200 bg-surface-50 px-2 py-1"
                    style={{ borderRadius: 2 }}
                  >
                    <span className="text-xs text-surface-700">{code}</span>
                    <button
                      onClick={() => removeCode(idx)}
                      className="text-surface-400 hover:text-surface-700 transition-colors ml-2"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-1">
                <input
                  type="text"
                  value={newCode}
                  onChange={e => setNewCode(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addCode()}
                  placeholder="Add a code…"
                  className="flex-1 border border-surface-200 bg-white text-xs px-2 py-1.5 focus:outline-none focus:border-surface-400"
                  style={{ borderRadius: 2 }}
                />
                <button
                  onClick={addCode}
                  disabled={!newCode.trim()}
                  className="border border-surface-200 px-2 py-1 text-xs text-surface-600 hover:bg-surface-50 disabled:opacity-40 transition-colors"
                  style={{ borderRadius: 2 }}
                >
                  <Plus size={12} />
                </button>
              </div>
            </div>
          )}

          {/* Step 6: Review */}
          {step === 6 && (
            <div>
              <h2 className="text-sm font-semibold text-surface-800 mb-4">Review & complete</h2>
              <div className="space-y-3 text-xs">
                <ReviewRow label="Company" value={form.companyName} />
                <ReviewRow label="Timezone" value={form.timezone} />
                <ReviewRow label="Admin name" value={form.adminName} />
                <ReviewRow label="Admin email" value={form.adminEmail} />
                <div className="border-t border-surface-100 pt-3">
                  <div className="text-2xs font-semibold text-surface-400 uppercase tracking-widest mb-2">SLA Targets</div>
                  {[1, 2, 3, 4].map(level => {
                    const p = priorities.find(x => x.level === level)
                    return (
                      <div key={level} className="flex justify-between py-0.5">
                        <span className="text-surface-500">P{level}{p ? ` – ${p.name}` : ''}</span>
                        <span className="text-surface-700 font-medium">{form.slaTargets[String(level)]}h</span>
                      </div>
                    )
                  })}
                </div>
                <div className="border-t border-surface-100 pt-3">
                  <div className="text-2xs font-semibold text-surface-400 uppercase tracking-widest mb-2">Resolution Codes</div>
                  <div className="text-surface-700">{form.resolutionCodes.join(', ')}</div>
                </div>
              </div>
              {error && (
                <div className="mt-4 text-xs text-red-600 border border-red-200 bg-red-50 px-3 py-2" style={{ borderRadius: 2 }}>
                  {error}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Nav buttons */}
        <div
          className="flex items-center justify-between px-6 py-3 border-t border-surface-200 bg-surface-50"
          style={{ borderRadius: '0 0 3px 3px' }}
        >
          <button
            onClick={back}
            disabled={step === 1}
            className="flex items-center gap-1 text-xs text-surface-500 hover:text-surface-700 disabled:opacity-0 transition-colors"
          >
            <ChevronLeft size={14} />
            Back
          </button>

          {step < TOTAL_STEPS ? (
            <button
              onClick={next}
              disabled={!canProceed()}
              className="flex items-center gap-1 bg-surface-800 text-white text-xs font-medium px-3 py-1.5 hover:bg-surface-700 disabled:opacity-40 transition-colors"
              style={{ borderRadius: 2 }}
            >
              Next
              <ChevronRight size={14} />
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={submitting}
              className="flex items-center gap-1 bg-surface-800 text-white text-xs font-medium px-3 py-1.5 hover:bg-surface-700 disabled:opacity-40 transition-colors"
              style={{ borderRadius: 2 }}
            >
              {submitting ? 'Setting up…' : 'Complete Setup'}
              {!submitting && <Check size={14} />}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-0.5">
      <span className="text-surface-500">{label}</span>
      <span className="text-surface-700 font-medium">{value}</span>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/Setup.tsx
git commit -m "feat: setup wizard page (6-step)"
```

---

## Task 9: AppSettings page

**Files:**
- Create: `frontend/src/pages/AppSettings.tsx`

- [ ] **Step 1: Write the page**

```tsx
// frontend/src/pages/AppSettings.tsx
import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, X, Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAppSettings } from '@/hooks/useAppSettings'
import { patchAppSettings } from '@/api/setup'
import { useMe } from '@/hooks/useMe'

const TIMEZONES: string[] = (Intl as any).supportedValuesOf?.('timeZone') ?? [
  'UTC', 'America/New_York', 'Europe/London', 'Europe/Paris', 'Asia/Tokyo',
]

export default function AppSettings() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: me } = useMe()
  const { data: settings, isLoading } = useAppSettings()
  const isAdmin = me?.scopes?.includes('Admin')

  const [companyName, setCompanyName] = useState('')
  const [timezone, setTimezone] = useState('UTC')
  const [slaTargets, setSlaTargets] = useState<Record<string, number>>({})
  const [codes, setCodes] = useState<string[]>([])
  const [newCode, setNewCode] = useState('')
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  useEffect(() => {
    if (settings) {
      setCompanyName(settings.company_name)
      setTimezone(settings.timezone)
      setSlaTargets(settings.sla_targets ?? { '1': 4, '2': 8, '3': 24, '4': 72 })
      setCodes(settings.resolution_codes ?? [])
    }
  }, [settings])

  async function saveSection(section: string, fields: object) {
    setSaving(section)
    setSaved(null)
    try {
      await patchAppSettings(fields)
      qc.invalidateQueries({ queryKey: ['app-settings'] })
      qc.invalidateQueries({ queryKey: ['setup-status'] })
      setSaved(section)
      setTimeout(() => setSaved(null), 2000)
    } finally {
      setSaving(null)
    }
  }

  function addCode() {
    const c = newCode.trim()
    if (c && !codes.includes(c)) setCodes(prev => [...prev, c])
    setNewCode('')
  }

  const inputCls = 'w-full border border-surface-200 bg-white text-xs px-2 py-1.5 focus:outline-none focus:border-surface-400'

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-xs text-surface-400">Loading…</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div
        className="flex-none flex items-center gap-3 px-4 bg-white border-b border-surface-200"
        style={{ height: 44 }}
      >
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-xs text-surface-500 hover:text-surface-700 transition-colors"
        >
          <ChevronLeft size={14} />
          Back
        </button>
        <span className="text-surface-300 flex-none">|</span>
        <span className="font-semibold text-surface-900" style={{ fontSize: 15 }}>Settings</span>
      </div>

      <div className="flex-1 overflow-y-auto bg-surface-50" style={{ padding: '24px 28px' }}>
        <div style={{ maxWidth: 580 }}>

          {!isAdmin && (
            <div className="mb-6 text-xs border border-surface-200 bg-surface-50 px-3 py-2 text-surface-500" style={{ borderRadius: 2 }}>
              You have read-only access to these settings. Admin role required to make changes.
            </div>
          )}

          {/* Company & timezone */}
          <section className="mb-8">
            <SectionHeader title="Company" />
            <div className="mb-3">
              <label className="block text-xs font-medium text-surface-600 mb-1">Company name</label>
              <input
                type="text"
                value={companyName}
                onChange={e => setCompanyName(e.target.value)}
                disabled={!isAdmin}
                className={inputCls}
                style={{ borderRadius: 2 }}
              />
            </div>
            <div className="mb-4">
              <label className="block text-xs font-medium text-surface-600 mb-1">Timezone</label>
              <select
                value={timezone}
                onChange={e => setTimezone(e.target.value)}
                disabled={!isAdmin}
                className={inputCls}
                style={{ borderRadius: 2 }}
              >
                {TIMEZONES.map(tz => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </div>
            {isAdmin && (
              <SaveButton
                saving={saving === 'company'}
                saved={saved === 'company'}
                onClick={() => saveSection('company', { company_name: companyName, timezone })}
              />
            )}
          </section>

          {/* SLA targets */}
          <section className="mb-8">
            <SectionHeader title="SLA Targets" />
            <table className="w-full text-xs mb-4">
              <thead>
                <tr className="border-b border-surface-200">
                  <th className="text-left pb-2 text-surface-500 font-medium">Priority</th>
                  <th className="text-right pb-2 text-surface-500 font-medium">Hours</th>
                </tr>
              </thead>
              <tbody>
                {[1, 2, 3, 4].map(level => (
                  <tr key={level} className="border-b border-surface-100">
                    <td className="py-2 text-surface-700">P{level}</td>
                    <td className="py-2 text-right">
                      <input
                        type="number"
                        min={1}
                        value={slaTargets[String(level)] ?? ''}
                        onChange={e => setSlaTargets(prev => ({
                          ...prev,
                          [String(level)]: Number(e.target.value),
                        }))}
                        disabled={!isAdmin}
                        className="border border-surface-200 bg-white text-xs px-2 py-1 focus:outline-none focus:border-surface-400 text-right disabled:bg-surface-50"
                        style={{ borderRadius: 2, width: 72 }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {isAdmin && (
              <SaveButton
                saving={saving === 'sla'}
                saved={saved === 'sla'}
                onClick={() => saveSection('sla', { sla_targets: slaTargets })}
              />
            )}
          </section>

          {/* Resolution codes */}
          <section className="mb-8">
            <SectionHeader title="Resolution Codes" />
            <div className="flex flex-col gap-1 mb-3">
              {codes.map((code, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between border border-surface-200 bg-surface-50 px-2 py-1"
                  style={{ borderRadius: 2 }}
                >
                  <span className="text-xs text-surface-700">{code}</span>
                  {isAdmin && (
                    <button
                      onClick={() => setCodes(prev => prev.filter((_, i) => i !== idx))}
                      className="text-surface-400 hover:text-surface-700 transition-colors"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {isAdmin && (
              <>
                <div className="flex gap-1 mb-3">
                  <input
                    type="text"
                    value={newCode}
                    onChange={e => setNewCode(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addCode()}
                    placeholder="Add a code…"
                    className="flex-1 border border-surface-200 bg-white text-xs px-2 py-1.5 focus:outline-none focus:border-surface-400"
                    style={{ borderRadius: 2 }}
                  />
                  <button
                    onClick={addCode}
                    disabled={!newCode.trim()}
                    className="border border-surface-200 px-2 py-1 text-xs text-surface-600 hover:bg-surface-50 disabled:opacity-40 transition-colors"
                    style={{ borderRadius: 2 }}
                  >
                    <Plus size={12} />
                  </button>
                </div>
                <SaveButton
                  saving={saving === 'codes'}
                  saved={saved === 'codes'}
                  onClick={() => saveSection('codes', { resolution_codes: codes })}
                />
              </>
            )}
          </section>

        </div>
      </div>
    </div>
  )
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="text-2xs font-semibold text-surface-400 uppercase tracking-widest pb-2 mb-4 border-b border-surface-200">
      {title}
    </div>
  )
}

function SaveButton({ saving, saved, onClick }: { saving: boolean; saved: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={saving}
      className="text-xs px-3 py-1.5 font-medium border border-surface-200 hover:bg-surface-50 disabled:opacity-40 transition-colors"
      style={{ borderRadius: 2, background: saved ? 'var(--surface-active)' : undefined }}
    >
      {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save'}
    </button>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/AppSettings.tsx
git commit -m "feat: admin app settings page"
```

---

## Task 10: Router, Layout, Login updates

**Files:**
- Modify: `frontend/src/router.tsx`
- Modify: `frontend/src/components/Layout.tsx`
- Modify: `frontend/src/pages/Login.tsx`

- [ ] **Step 1: Update router.tsx**

Add `RequireSetup` component and new routes:

```tsx
// frontend/src/router.tsx
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { isAuthenticated } from '@/api/auth'
import Layout from '@/components/Layout'
import Login from '@/pages/Login'
import Incidents from '@/pages/Incidents'
import IncidentNew from '@/pages/IncidentNew'
import IncidentDetail from '@/pages/IncidentDetail'
import Dashboard from '@/pages/Dashboard'
import AppSettings from '@/pages/AppSettings'
import AppearanceSettings from '@/pages/Settings'  // renamed import alias
import Setup from '@/pages/Setup'
import { useSetupStatus } from '@/hooks/useSetupStatus'
import { Navigate as Nav } from 'react-router-dom'

function RequireSetup({ children }: { children: React.ReactNode }) {
  const { data, isLoading } = useSetupStatus()
  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface-100 flex items-center justify-center">
        <span className="text-xs text-surface-400">Loading…</span>
      </div>
    )
  }
  if (data && !data.completed) {
    return <Nav to="/setup" replace />
  }
  return <>{children}</>
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}

export const router = createBrowserRouter([
  {
    path: '/setup',
    element: <Setup />,
  },
  {
    path: '/login',
    element: (
      <RequireSetup>
        <Login />
      </RequireSetup>
    ),
  },
  {
    path: '/',
    element: (
      <RequireSetup>
        <RequireAuth>
          <Layout />
        </RequireAuth>
      </RequireSetup>
    ),
    children: [
      { index: true, element: <Navigate to="/incidents" replace /> },
      { path: 'incidents', element: <Incidents /> },
      { path: 'incidents/new', element: <IncidentNew /> },
      { path: 'incidents/:id', element: <IncidentDetail /> },
      { path: 'dashboard', element: <Dashboard /> },
      { path: 'settings', element: <AppSettings /> },
      { path: 'settings/appearance', element: <AppearanceSettings /> },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
])
```

- [ ] **Step 2: Update Layout.tsx**

- Show company name from `useSetupStatus().data?.company_name` instead of hardcoded "ITSM"
- Add "Appearance" link in sidebar alongside "Settings"

Changes in `Layout.tsx`:
1. Import `useSetupStatus` from `@/hooks/useSetupStatus`
2. Inside component: `const { data: setupStatus } = useSetupStatus()`
3. In top bar, change `ITSM` text to: `{setupStatus?.company_name ?? 'ITSM'}`
4. In sidebar bottom section, add link to /settings/appearance after the Settings link

```tsx
// In the bottom nav section (after existing Settings link):
<Link
  to="/settings/appearance"
  className={`flex items-center gap-2 px-3 text-xs transition-colors ${
    location.pathname === '/settings/appearance'
      ? 'bg-surface-200 text-surface-800 font-medium'
      : 'text-surface-700 hover:bg-surface-100'
  }`}
  style={{ height: 28, lineHeight: '28px', textDecoration: 'none' }}
>
  <Settings size={12} className="flex-none" />
  Appearance
</Link>
```

Also update the Settings link label to "Settings" (it already says Settings, but point it to /settings which is now AppSettings):
The existing link at `/settings` will now go to AppSettings. Add the appearance link below it.

- [ ] **Step 3: Update Login.tsx**

Add a check: if setup is not done, redirect to /setup. But since RequireSetup now wraps Login in the router, the redirect happens automatically. No change needed to Login.tsx itself for the redirect.

However, update the seeded users list to be dynamically loadable. Actually, Login.tsx currently hardcodes SEEDED_USERS. This is fine for now — leave Login.tsx as is (the RequireSetup wrapper handles the redirect case).

- [ ] **Step 4: Verify the app works end-to-end in the browser**

```bash
cd frontend
npm run dev
```

Open http://localhost:5173. With a fresh dev.db (after running `uv run alembic upgrade head`):
- Should redirect to /setup
- Complete the wizard
- Should land on /incidents
- /setup should show "already complete" (redirect to /incidents)
- Settings page at /settings should show app settings
- Appearance settings at /settings/appearance should show theme/font settings

- [ ] **Step 5: Commit**

```bash
git add frontend/src/router.tsx frontend/src/components/Layout.tsx frontend/src/pages/Login.tsx
git commit -m "feat: router setup guard, layout company name, settings routes"
```

---

## Final verification checklist

1. `uv run alembic upgrade head` — applies migration, app_settings table created
2. `uv run pytest tests/ -v` — all 110+ tests pass
3. Frontend: fresh dev.db redirects to /setup on first load
4. Wizard: completes all 6 steps, creates admin, lands on /incidents
5. /setup visited again → redirected to /incidents (already complete)
6. /settings → app settings page with company, SLA, codes
7. /settings/appearance → existing theme/font settings
8. PATCH /settings as non-admin → 403
9. SLA changes in settings → new incidents use updated hours
