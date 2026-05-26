# ITSM Data Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full data layer for the ITSM backend: 4 SQLAlchemy models, Pydantic schemas, repositories, state machine, numbering service, Alembic migration, and a working seed script.

**Architecture:** Single-tenant design — no tenant_id anywhere. All DB access goes through repositories; services never write raw SQL. Incident state transitions are validated by `state_machine.py` which reads from the `app_config` singleton (already loaded from `config.yaml`). Numbers are generated dialect-aware: MAX+1 inside a transaction for SQLite, a DB sequence for HANA.

**Tech Stack:** Python 3.11+, SQLAlchemy 2.0 async, Pydantic v2, pytest-asyncio, Alembic 1.13, aiosqlite (dev), hdbcli (prod)

---

## File Map

| File | Responsibility |
|------|----------------|
| `backend/app/models/user.py` | User ORM model |
| `backend/app/models/incident.py` | Incident ORM model |
| `backend/app/models/incident_event.py` | IncidentEvent ORM model (activity stream) |
| `backend/app/models/attachment.py` | Attachment ORM model |
| `backend/app/models/__init__.py` | Re-export all models (needed for Alembic import) |
| `backend/app/schemas/user.py` | UserCreate / UserResponse Pydantic schemas |
| `backend/app/schemas/incident.py` | IncidentCreate / IncidentUpdate / IncidentResponse |
| `backend/app/schemas/incident_event.py` | IncidentEventCreate / IncidentEventResponse |
| `backend/app/schemas/attachment.py` | AttachmentCreate / AttachmentResponse |
| `backend/app/schemas/__init__.py` | Re-export all schemas |
| `backend/app/state_machine.py` | `can_transition()` + `validate_transition()` |
| `backend/app/services/numbering.py` | `next_incident_number()` — dialect-aware |
| `backend/app/repositories/user_repository.py` | UserRepository CRUD |
| `backend/app/repositories/incident_repository.py` | IncidentRepository CRUD + list filters |
| `backend/app/repositories/incident_event_repository.py` | IncidentEventRepository |
| `backend/app/repositories/attachment_repository.py` | AttachmentRepository |
| `backend/app/repositories/__init__.py` | Re-export all repos |
| `backend/alembic.ini` | Alembic config (created via `alembic init`) |
| `backend/alembic/env.py` | Async env — imports Base + all models |
| `backend/alembic/versions/<hash>_initial.py` | Generated initial migration |
| `backend/scripts/seed_dev.py` | Inserts test users, incidents, events, attachment |
| `backend/tests/conftest.py` | Async SQLite fixture shared by all test modules |
| `backend/tests/test_models.py` | Smoke-tests model instantiation + DB round-trip |
| `backend/tests/test_schemas.py` | Schema validation tests |
| `backend/tests/test_state_machine.py` | Transition logic tests |
| `backend/tests/test_numbering.py` | Number generation + format tests |
| `backend/tests/test_repositories.py` | Repository CRUD + query tests |

---

## Task 1: SQLAlchemy ORM Models

**Files:**
- Create: `backend/app/models/user.py`
- Create: `backend/app/models/incident.py`
- Create: `backend/app/models/incident_event.py`
- Create: `backend/app/models/attachment.py`
- Modify: `backend/app/models/__init__.py`
- Create: `backend/tests/conftest.py`
- Create: `backend/tests/test_models.py`

All commands run from `backend/`.

---

- [ ] **Step 1: Write the failing model test**

Create `backend/tests/conftest.py`:
```python
from __future__ import annotations
import pytest_asyncio
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.db import Base

# Import all models so they register with Base.metadata before create_all
import app.models  # noqa: F401 — side-effect import registers all models


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
```

Create `backend/tests/test_models.py`:
```python
from __future__ import annotations
import uuid
from datetime import datetime
from sqlalchemy import select
from app.models.user import User
from app.models.incident import Incident
from app.models.incident_event import IncidentEvent
from app.models.attachment import Attachment


async def test_user_round_trip(db_session):
    user = User(
        id=str(uuid.uuid4()),
        email="test@example.com",
        name="Test User",
        role="agent",
    )
    db_session.add(user)
    await db_session.flush()
    result = await db_session.execute(select(User).where(User.email == "test@example.com"))
    fetched = result.scalar_one()
    assert fetched.name == "Test User"
    assert fetched.active is True


async def test_incident_round_trip(db_session):
    user = User(id=str(uuid.uuid4()), email="req@example.com", name="Requester", role="requester")
    db_session.add(user)
    await db_session.flush()

    incident = Incident(
        id=str(uuid.uuid4()),
        number="INC0000001",
        title="Test incident",
        description="Something broke",
        state="new",
        priority=2,
        category="Software",
        source="web",
        requester_id=user.id,
    )
    db_session.add(incident)
    await db_session.flush()
    result = await db_session.execute(select(Incident).where(Incident.number == "INC0000001"))
    fetched = result.scalar_one()
    assert fetched.title == "Test incident"
    assert fetched.sla_breached is False


async def test_incident_event_round_trip(db_session):
    user = User(id=str(uuid.uuid4()), email="a@b.com", name="A", role="agent")
    db_session.add(user)
    await db_session.flush()

    incident = Incident(
        id=str(uuid.uuid4()), number="INC0000002", title="T", description="D",
        state="new", priority=1, category="Network", source="web", requester_id=user.id,
    )
    db_session.add(incident)
    await db_session.flush()

    event = IncidentEvent(
        id=str(uuid.uuid4()),
        incident_id=incident.id,
        actor_id=user.id,
        event_type="comment",
        body="First comment",
    )
    db_session.add(event)
    await db_session.flush()
    result = await db_session.execute(
        select(IncidentEvent).where(IncidentEvent.incident_id == incident.id)
    )
    fetched = result.scalar_one()
    assert fetched.body == "First comment"
    assert fetched.event_metadata is None


async def test_attachment_round_trip(db_session):
    user = User(id=str(uuid.uuid4()), email="c@d.com", name="C", role="requester")
    db_session.add(user)
    await db_session.flush()
    incident = Incident(
        id=str(uuid.uuid4()), number="INC0000003", title="T", description="D",
        state="new", priority=3, category="Hardware", source="web", requester_id=user.id,
    )
    db_session.add(incident)
    await db_session.flush()
    att = Attachment(
        id=str(uuid.uuid4()),
        incident_id=incident.id,
        filename="screenshot.png",
        mime_type="image/png",
        size_bytes=12345,
        blob_ref="./uploads/screenshot.png",
        uploaded_by=user.id,
    )
    db_session.add(att)
    await db_session.flush()
    result = await db_session.execute(select(Attachment).where(Attachment.incident_id == incident.id))
    fetched = result.scalar_one()
    assert fetched.filename == "screenshot.png"
```

- [ ] **Step 2: Run tests — expect import errors (models don't exist yet)**

```
cd backend
uv run pytest tests/test_models.py -v
```
Expected: `ImportError: cannot import name 'User' from 'app.models.user'` (or similar)

- [ ] **Step 3: Create `backend/app/models/user.py`**

```python
from __future__ import annotations
import uuid
from datetime import datetime
from sqlalchemy import String, Boolean, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from ..db import Base


def _utcnow() -> datetime:
    return datetime.utcnow()


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(50), nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, onupdate=_utcnow, nullable=False)
```

- [ ] **Step 4: Create `backend/app/models/incident.py`**

```python
from __future__ import annotations
import uuid
from datetime import datetime
from sqlalchemy import String, Boolean, DateTime, Text, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from ..db import Base


def _utcnow() -> datetime:
    return datetime.utcnow()


class Incident(Base):
    __tablename__ = "incidents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    number: Mapped[str] = mapped_column(String(20), unique=True, index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    state: Mapped[str] = mapped_column(String(50), nullable=False, default="new")
    priority: Mapped[int] = mapped_column(Integer, nullable=False)
    category: Mapped[str] = mapped_column(String(100), nullable=False)
    source: Mapped[str] = mapped_column(String(50), nullable=False)
    requester_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    assignee_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    resolution_code: Mapped[str | None] = mapped_column(String(100), nullable=True)
    resolution_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    sla_resolution_due: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    sla_breached: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, onupdate=_utcnow, nullable=False)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
```

- [ ] **Step 5: Create `backend/app/models/incident_event.py`**

Note: The Python attribute is named `event_metadata` to avoid shadowing SQLAlchemy's reserved `metadata` attribute, but the DB column is named `metadata`.

```python
from __future__ import annotations
import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, Text, ForeignKey, JSON, Index
from sqlalchemy.orm import Mapped, mapped_column
from ..db import Base


def _utcnow() -> datetime:
    return datetime.utcnow()


class IncidentEvent(Base):
    __tablename__ = "incident_events"
    __table_args__ = (
        Index("ix_incident_events_incident_created", "incident_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    incident_id: Mapped[str] = mapped_column(String(36), ForeignKey("incidents.id"), nullable=False, index=True)
    actor_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    event_metadata: Mapped[dict | None] = mapped_column("metadata", JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False, index=True)
```

- [ ] **Step 6: Create `backend/app/models/attachment.py`**

```python
from __future__ import annotations
import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from ..db import Base


def _utcnow() -> datetime:
    return datetime.utcnow()


class Attachment(Base):
    __tablename__ = "attachments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    incident_id: Mapped[str] = mapped_column(String(36), ForeignKey("incidents.id"), nullable=False, index=True)
    filename: Mapped[str] = mapped_column(String(500), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    blob_ref: Mapped[str] = mapped_column(String(1000), nullable=False)
    uploaded_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)
```

- [ ] **Step 7: Update `backend/app/models/__init__.py`**

This import is critical — Alembic's `env.py` imports `app.models` to ensure all models register with `Base.metadata` before `autogenerate`.

```python
from .user import User
from .incident import Incident
from .incident_event import IncidentEvent
from .attachment import Attachment

__all__ = ["User", "Incident", "IncidentEvent", "Attachment"]
```

- [ ] **Step 8: Run tests — expect them to pass**

```
cd backend
uv run pytest tests/test_models.py -v
```
Expected output:
```
tests/test_models.py::test_user_round_trip PASSED
tests/test_models.py::test_incident_round_trip PASSED
tests/test_models.py::test_incident_event_round_trip PASSED
tests/test_models.py::test_attachment_round_trip PASSED
```

- [ ] **Step 9: Commit**

```bash
git add backend/app/models/ backend/tests/conftest.py backend/tests/test_models.py
git commit -m "feat: add SQLAlchemy ORM models for users, incidents, events, attachments"
```

---

## Task 2: Pydantic Schemas

**Files:**
- Create: `backend/app/schemas/user.py`
- Create: `backend/app/schemas/incident.py`
- Create: `backend/app/schemas/incident_event.py`
- Create: `backend/app/schemas/attachment.py`
- Modify: `backend/app/schemas/__init__.py`
- Create: `backend/tests/test_schemas.py`

---

- [ ] **Step 1: Write the failing schema tests**

Create `backend/tests/test_schemas.py`:
```python
from __future__ import annotations
import pytest
from datetime import datetime
from pydantic import ValidationError
from app.schemas.user import UserCreate, UserResponse
from app.schemas.incident import IncidentCreate, IncidentUpdate, IncidentResponse
from app.schemas.incident_event import IncidentEventCreate, IncidentEventResponse
from app.schemas.attachment import AttachmentResponse


def test_user_create_valid():
    u = UserCreate(email="a@b.com", name="Alice", role="agent")
    assert u.role == "agent"


def test_user_create_invalid_role():
    with pytest.raises(ValidationError, match="role"):
        UserCreate(email="a@b.com", name="Alice", role="superuser")


def test_incident_create_valid():
    i = IncidentCreate(
        title="VPN not connecting",
        description="Cannot connect to VPN since yesterday.",
        priority=1,
        category="Network",
        source="web",
        requester_id="some-uuid",
    )
    assert i.priority == 1
    assert i.state == "new"


def test_incident_create_invalid_priority():
    with pytest.raises(ValidationError, match="priority"):
        IncidentCreate(
            title="T", description="D", priority=5,
            category="Network", source="web", requester_id="x"
        )


def test_incident_create_invalid_category():
    with pytest.raises(ValidationError, match="category"):
        IncidentCreate(
            title="T", description="D", priority=1,
            category="InvalidCat", source="web", requester_id="x"
        )


def test_incident_create_invalid_source():
    with pytest.raises(ValidationError, match="source"):
        IncidentCreate(
            title="T", description="D", priority=1,
            category="Software", source="fax", requester_id="x"
        )


def test_incident_update_partial():
    u = IncidentUpdate(title="Updated title")
    assert u.title == "Updated title"
    assert u.description is None


def test_event_create_valid():
    e = IncidentEventCreate(
        incident_id="inc-uuid",
        actor_id="user-uuid",
        event_type="comment",
        body="This is a comment",
    )
    assert e.event_type == "comment"


def test_event_create_invalid_type():
    with pytest.raises(ValidationError, match="event_type"):
        IncidentEventCreate(
            incident_id="x", actor_id="y",
            event_type="random_type", body="hi"
        )


def test_response_from_orm_attributes():
    # Verify from_attributes=True works
    class FakeUser:
        id = "uuid-1"
        email = "e@f.com"
        name = "Fake"
        role = "admin"
        active = True
        created_at = datetime(2026, 1, 1)
        updated_at = datetime(2026, 1, 1)

    resp = UserResponse.model_validate(FakeUser())
    assert resp.email == "e@f.com"
```

- [ ] **Step 2: Run tests — expect ImportError**

```
cd backend
uv run pytest tests/test_schemas.py -v
```
Expected: `ImportError: cannot import name 'UserCreate' from 'app.schemas.user'`

- [ ] **Step 3: Create `backend/app/schemas/user.py`**

```python
from __future__ import annotations
from datetime import datetime
from pydantic import BaseModel, field_validator


_VALID_ROLES = {"requester", "agent", "admin"}


class UserCreate(BaseModel):
    email: str
    name: str
    role: str

    @field_validator("role")
    @classmethod
    def valid_role(cls, v: str) -> str:
        if v not in _VALID_ROLES:
            raise ValueError(f"role must be one of: {sorted(_VALID_ROLES)}")
        return v


class UserUpdate(BaseModel):
    name: str | None = None
    role: str | None = None
    active: bool | None = None

    @field_validator("role")
    @classmethod
    def valid_role(cls, v: str | None) -> str | None:
        if v is not None and v not in _VALID_ROLES:
            raise ValueError(f"role must be one of: {sorted(_VALID_ROLES)}")
        return v


class UserResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    email: str
    name: str
    role: str
    active: bool
    created_at: datetime
    updated_at: datetime
```

- [ ] **Step 4: Create `backend/app/schemas/incident.py`**

```python
from __future__ import annotations
from datetime import datetime
from pydantic import BaseModel, field_validator
from ..config import app_config


_VALID_SOURCES = {"web", "email", "classifier_escalation", "fix_failed_escalation"}


class IncidentCreate(BaseModel):
    title: str
    description: str
    priority: int
    category: str
    source: str
    requester_id: str
    assignee_id: str | None = None
    state: str = "new"

    @field_validator("priority")
    @classmethod
    def valid_priority(cls, v: int) -> int:
        if not 1 <= v <= len(app_config.priorities):
            raise ValueError(f"priority must be between 1 and {len(app_config.priorities)}")
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

    @field_validator("state")
    @classmethod
    def valid_state(cls, v: str) -> str:
        if v not in app_config.states:
            raise ValueError(f"state must be one of: {app_config.states}")
        return v


class IncidentUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    priority: int | None = None
    category: str | None = None
    assignee_id: str | None = None
    resolution_code: str | None = None
    resolution_notes: str | None = None

    @field_validator("priority")
    @classmethod
    def valid_priority(cls, v: int | None) -> int | None:
        if v is not None and not 1 <= v <= len(app_config.priorities):
            raise ValueError(f"priority must be between 1 and {len(app_config.priorities)}")
        return v

    @field_validator("category")
    @classmethod
    def valid_category(cls, v: str | None) -> str | None:
        if v is not None and v not in app_config.categories:
            raise ValueError(f"category must be one of: {app_config.categories}")
        return v


class IncidentResponse(BaseModel):
    model_config = {"from_attributes": True}

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
    model_config = {"from_attributes": True}

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
```

- [ ] **Step 5: Create `backend/app/schemas/incident_event.py`**

```python
from __future__ import annotations
from datetime import datetime
from pydantic import BaseModel, field_validator


_VALID_EVENT_TYPES = {
    "comment", "work_note", "state_change", "field_update",
    "assignment", "attachment_added",
}


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


class IncidentEventResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    incident_id: str
    actor_id: str
    event_type: str
    body: str | None
    event_metadata: dict | None
    created_at: datetime
```

- [ ] **Step 6: Create `backend/app/schemas/attachment.py`**

```python
from __future__ import annotations
from datetime import datetime
from pydantic import BaseModel


class AttachmentCreate(BaseModel):
    incident_id: str
    filename: str
    mime_type: str
    size_bytes: int
    blob_ref: str
    uploaded_by: str


class AttachmentResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    incident_id: str
    filename: str
    mime_type: str
    size_bytes: int
    blob_ref: str
    uploaded_by: str
    uploaded_at: datetime
```

- [ ] **Step 7: Update `backend/app/schemas/__init__.py`**

```python
from .user import UserCreate, UserUpdate, UserResponse
from .incident import IncidentCreate, IncidentUpdate, IncidentResponse, IncidentListItem
from .incident_event import IncidentEventCreate, IncidentEventResponse
from .attachment import AttachmentCreate, AttachmentResponse

__all__ = [
    "UserCreate", "UserUpdate", "UserResponse",
    "IncidentCreate", "IncidentUpdate", "IncidentResponse", "IncidentListItem",
    "IncidentEventCreate", "IncidentEventResponse",
    "AttachmentCreate", "AttachmentResponse",
]
```

- [ ] **Step 8: Run tests — all should pass**

```
cd backend
uv run pytest tests/test_schemas.py -v
```
Expected: all 9 tests PASSED.

- [ ] **Step 9: Commit**

```bash
git add backend/app/schemas/ backend/tests/test_schemas.py
git commit -m "feat: add Pydantic v2 schemas for all ITSM entities"
```

---

## Task 3: State Machine

**Files:**
- Create: `backend/app/state_machine.py`
- Create: `backend/tests/test_state_machine.py`

---

- [ ] **Step 1: Write the failing state machine tests**

Create `backend/tests/test_state_machine.py`:
```python
from __future__ import annotations
import pytest
from app.state_machine import can_transition, validate_transition


# --- can_transition tests ---

def test_new_to_assigned_is_valid():
    assert can_transition("new", "assigned") is True


def test_new_to_resolved_is_invalid():
    assert can_transition("new", "resolved") is False


def test_assigned_to_in_progress_is_valid():
    assert can_transition("assigned", "in_progress") is True


def test_assigned_to_closed_is_invalid():
    assert can_transition("assigned", "closed") is False


def test_in_progress_to_resolved_is_valid():
    assert can_transition("in_progress", "resolved") is True


def test_closed_has_no_transitions():
    assert can_transition("closed", "new") is False
    assert can_transition("closed", "resolved") is False


def test_unknown_state_is_invalid():
    assert can_transition("ghost_state", "new") is False


# --- validate_transition tests ---

def test_valid_transition_no_exception():
    # new -> assigned requires no extra fields
    validate_transition("new", "assigned", {})


def test_invalid_transition_raises():
    with pytest.raises(ValueError, match="Cannot transition"):
        validate_transition("new", "closed", {})


def test_resolve_requires_resolution_fields():
    with pytest.raises(ValueError, match="resolution_code"):
        validate_transition("in_progress", "resolved", {})


def test_resolve_with_missing_notes_raises():
    with pytest.raises(ValueError, match="resolution_notes"):
        validate_transition("in_progress", "resolved", {"resolution_code": "fixed"})


def test_resolve_with_all_fields_passes():
    validate_transition(
        "in_progress", "resolved",
        {"resolution_code": "fixed", "resolution_notes": "Reinstalled driver."}
    )


def test_closed_to_anything_raises():
    with pytest.raises(ValueError, match="Cannot transition"):
        validate_transition("closed", "new", {})
```

- [ ] **Step 2: Run tests — expect ImportError**

```
cd backend
uv run pytest tests/test_state_machine.py -v
```
Expected: `ImportError: cannot import name 'can_transition' from 'app.state_machine'`

- [ ] **Step 3: Create `backend/app/state_machine.py`**

```python
from __future__ import annotations
from .config import app_config

# States that require resolution_code + resolution_notes on entry
_REQUIRES_RESOLUTION: frozenset[str] = frozenset({"resolved"})


def can_transition(from_state: str, to_state: str) -> bool:
    """Return True if transitioning from_state -> to_state is configured as valid."""
    allowed = app_config.state_transitions.get(from_state, [])
    return to_state in allowed


def validate_transition(from_state: str, to_state: str, payload: dict) -> None:
    """Raise ValueError if the transition is not allowed or required fields are missing.

    payload is the dict of fields being set on this transition
    (e.g. {"resolution_code": "...", "resolution_notes": "..."}).
    """
    if not can_transition(from_state, to_state):
        allowed = app_config.state_transitions.get(from_state, [])
        raise ValueError(
            f"Cannot transition from '{from_state}' to '{to_state}'. "
            f"Allowed next states: {allowed}"
        )
    if to_state in _REQUIRES_RESOLUTION:
        missing = [
            f for f in ("resolution_code", "resolution_notes")
            if not payload.get(f)
        ]
        if missing:
            raise ValueError(
                f"Transitioning to '{to_state}' requires: {', '.join(missing)}"
            )
```

- [ ] **Step 4: Run tests — all should pass**

```
cd backend
uv run pytest tests/test_state_machine.py -v
```
Expected: all 11 tests PASSED.

- [ ] **Step 5: Commit**

```bash
git add backend/app/state_machine.py backend/tests/test_state_machine.py
git commit -m "feat: add incident state machine with transition validation"
```

---

## Task 4: Numbering Service

**Files:**
- Create: `backend/app/services/numbering.py`
- Create: `backend/tests/test_numbering.py`

---

- [ ] **Step 1: Write the failing numbering tests**

Create `backend/tests/test_numbering.py`:
```python
from __future__ import annotations
import uuid
from app.models.user import User
from app.models.incident import Incident
from app.services.numbering import next_incident_number


async def test_first_number_is_one(db_session):
    num = await next_incident_number(db_session)
    assert num == "INC0000001"


async def test_second_number_increments(db_session):
    user = User(id=str(uuid.uuid4()), email="x@y.com", name="X", role="requester")
    db_session.add(user)
    await db_session.flush()

    inc = Incident(
        id=str(uuid.uuid4()), number="INC0000001",
        title="T", description="D", state="new",
        priority=1, category="Network", source="web",
        requester_id=user.id,
    )
    db_session.add(inc)
    await db_session.flush()

    num = await next_incident_number(db_session)
    assert num == "INC0000002"


async def test_number_format_is_zero_padded(db_session):
    num = await next_incident_number(db_session)
    assert len(num) == 10  # "INC" (3) + 7 digits
    assert num.startswith("INC")
    assert num[3:].isdigit()
```

- [ ] **Step 2: Run tests — expect ImportError**

```
cd backend
uv run pytest tests/test_numbering.py -v
```
Expected: `ImportError: cannot import name 'next_incident_number' from 'app.services.numbering'`

- [ ] **Step 3: Create `backend/app/services/numbering.py`**

```python
from __future__ import annotations
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession
from ..models.incident import Incident
from ..config import app_config, env_settings


async def next_incident_number(session: AsyncSession) -> str:
    """Return the next incident number string (e.g. 'INC0000042').

    SQLite: uses MAX(number) + 1 inside the current transaction.
    HANA:   uses a DB sequence (ITSM_INC_SEQ) created by the initial migration.
    """
    prefix = app_config.number_prefix
    db_url = env_settings.database_url.lower()

    if "hana" in db_url or "hdbcli" in db_url:
        result = await session.execute(text("SELECT ITSM_INC_SEQ.NEXTVAL FROM DUMMY"))
        n: int = result.scalar_one()
    else:
        result = await session.execute(select(func.max(Incident.number)))
        max_num: str | None = result.scalar_one_or_none()
        if max_num is None:
            n = 1
        else:
            n = int(max_num[len(prefix):]) + 1

    return f"{prefix}{n:07d}"
```

- [ ] **Step 4: Run tests — all should pass**

```
cd backend
uv run pytest tests/test_numbering.py -v
```
Expected: all 3 tests PASSED.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/numbering.py backend/tests/test_numbering.py
git commit -m "feat: add incident numbering service (SQLite MAX+1 / HANA sequence)"
```

---

## Task 5: Repositories

**Files:**
- Create: `backend/app/repositories/user_repository.py`
- Create: `backend/app/repositories/incident_repository.py`
- Create: `backend/app/repositories/incident_event_repository.py`
- Create: `backend/app/repositories/attachment_repository.py`
- Modify: `backend/app/repositories/__init__.py`
- Create: `backend/tests/test_repositories.py`

---

- [ ] **Step 1: Write the failing repository tests**

Create `backend/tests/test_repositories.py`:
```python
from __future__ import annotations
import uuid
import pytest
from datetime import datetime
from app.repositories.user_repository import UserRepository
from app.repositories.incident_repository import IncidentRepository
from app.repositories.incident_event_repository import IncidentEventRepository
from app.repositories.attachment_repository import AttachmentRepository
from app.schemas.user import UserCreate
from app.schemas.incident import IncidentCreate
from app.schemas.incident_event import IncidentEventCreate
from app.schemas.attachment import AttachmentCreate


# ---- User Repository ----

async def test_create_and_get_user(db_session):
    repo = UserRepository(db_session)
    user = await repo.create(UserCreate(email="alice@corp.com", name="Alice", role="agent"))
    await db_session.flush()
    fetched = await repo.get_by_id(user.id)
    assert fetched is not None
    assert fetched.email == "alice@corp.com"


async def test_get_user_by_email(db_session):
    repo = UserRepository(db_session)
    await repo.create(UserCreate(email="bob@corp.com", name="Bob", role="requester"))
    await db_session.flush()
    fetched = await repo.get_by_email("bob@corp.com")
    assert fetched is not None
    assert fetched.name == "Bob"


async def test_get_user_not_found_returns_none(db_session):
    repo = UserRepository(db_session)
    result = await repo.get_by_id("nonexistent-id")
    assert result is None


async def test_list_active_users(db_session):
    repo = UserRepository(db_session)
    await repo.create(UserCreate(email="c1@corp.com", name="C1", role="agent"))
    await repo.create(UserCreate(email="c2@corp.com", name="C2", role="admin"))
    await db_session.flush()
    users = await repo.list_active()
    assert len(users) == 2


# ---- Incident Repository ----

async def _make_user(db_session, email="u@c.com"):
    repo = UserRepository(db_session)
    u = await repo.create(UserCreate(email=email, name="User", role="requester"))
    await db_session.flush()
    return u


async def test_create_incident(db_session):
    user = await _make_user(db_session)
    repo = IncidentRepository(db_session)
    inc = await repo.create(IncidentCreate(
        title="Outlook crashes on startup",
        description="Every time I open Outlook it crashes immediately.",
        priority=2,
        category="Software",
        source="web",
        requester_id=user.id,
    ))
    await db_session.flush()
    assert inc.number.startswith("INC")
    assert inc.state == "new"
    assert inc.sla_resolution_due is not None


async def test_get_incident_by_number(db_session):
    user = await _make_user(db_session, "u2@c.com")
    repo = IncidentRepository(db_session)
    inc = await repo.create(IncidentCreate(
        title="VPN not connecting", description="D", priority=1,
        category="Network", source="web", requester_id=user.id
    ))
    await db_session.flush()
    fetched = await repo.get_by_number(inc.number)
    assert fetched is not None
    assert fetched.title == "VPN not connecting"


async def test_list_incidents_by_state(db_session):
    user = await _make_user(db_session, "u3@c.com")
    repo = IncidentRepository(db_session)
    await repo.create(IncidentCreate(
        title="A", description="D", priority=3, category="Hardware",
        source="web", requester_id=user.id
    ))
    await repo.create(IncidentCreate(
        title="B", description="D", priority=2, category="Software",
        source="web", requester_id=user.id
    ))
    await db_session.flush()
    results = await repo.list(state="new")
    assert len(results) == 2


async def test_update_incident(db_session):
    user = await _make_user(db_session, "u4@c.com")
    repo = IncidentRepository(db_session)
    inc = await repo.create(IncidentCreate(
        title="Old title", description="D", priority=3, category="Hardware",
        source="web", requester_id=user.id
    ))
    await db_session.flush()
    updated = await repo.update(inc.id, {"title": "New title"})
    assert updated is not None
    assert updated.title == "New title"


# ---- IncidentEvent Repository ----

async def test_create_event(db_session):
    user = await _make_user(db_session, "u5@c.com")
    inc_repo = IncidentRepository(db_session)
    inc = await inc_repo.create(IncidentCreate(
        title="T", description="D", priority=2, category="Software",
        source="web", requester_id=user.id
    ))
    await db_session.flush()

    ev_repo = IncidentEventRepository(db_session)
    ev = await ev_repo.create(IncidentEventCreate(
        incident_id=inc.id, actor_id=user.id, event_type="comment",
        body="Looking into this now."
    ))
    await db_session.flush()
    assert ev.event_type == "comment"
    assert ev.event_metadata is None


async def test_list_events_for_incident(db_session):
    user = await _make_user(db_session, "u6@c.com")
    inc_repo = IncidentRepository(db_session)
    inc = await inc_repo.create(IncidentCreate(
        title="T", description="D", priority=1, category="Network",
        source="web", requester_id=user.id
    ))
    await db_session.flush()

    ev_repo = IncidentEventRepository(db_session)
    await ev_repo.create(IncidentEventCreate(
        incident_id=inc.id, actor_id=user.id, event_type="comment", body="First"
    ))
    await ev_repo.create(IncidentEventCreate(
        incident_id=inc.id, actor_id=user.id, event_type="work_note", body="Second"
    ))
    await db_session.flush()
    events = await ev_repo.list_for_incident(inc.id)
    assert len(events) == 2


# ---- Attachment Repository ----

async def test_create_attachment(db_session):
    user = await _make_user(db_session, "u7@c.com")
    inc_repo = IncidentRepository(db_session)
    inc = await inc_repo.create(IncidentCreate(
        title="T", description="D", priority=2, category="Software",
        source="web", requester_id=user.id
    ))
    await db_session.flush()

    att_repo = AttachmentRepository(db_session)
    att = await att_repo.create(AttachmentCreate(
        incident_id=inc.id, filename="log.txt", mime_type="text/plain",
        size_bytes=512, blob_ref="./uploads/log.txt", uploaded_by=user.id
    ))
    await db_session.flush()
    assert att.filename == "log.txt"


async def test_list_attachments_for_incident(db_session):
    user = await _make_user(db_session, "u8@c.com")
    inc_repo = IncidentRepository(db_session)
    inc = await inc_repo.create(IncidentCreate(
        title="T", description="D", priority=3, category="Hardware",
        source="web", requester_id=user.id
    ))
    await db_session.flush()

    att_repo = AttachmentRepository(db_session)
    await att_repo.create(AttachmentCreate(
        incident_id=inc.id, filename="a.pdf", mime_type="application/pdf",
        size_bytes=1024, blob_ref="./uploads/a.pdf", uploaded_by=user.id
    ))
    await db_session.flush()
    results = await att_repo.list_for_incident(inc.id)
    assert len(results) == 1
    assert results[0].filename == "a.pdf"
```

- [ ] **Step 2: Run tests — expect ImportError**

```
cd backend
uv run pytest tests/test_repositories.py -v
```
Expected: `ImportError: cannot import name 'UserRepository'`

- [ ] **Step 3: Create `backend/app/repositories/user_repository.py`**

```python
from __future__ import annotations
import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from ..models.user import User
from ..schemas.user import UserCreate


class UserRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(self, data: UserCreate) -> User:
        user = User(
            id=str(uuid.uuid4()),
            email=data.email,
            name=data.name,
            role=data.role,
        )
        self.session.add(user)
        return user

    async def get_by_id(self, user_id: str) -> User | None:
        result = await self.session.execute(
            select(User).where(User.id == user_id)
        )
        return result.scalar_one_or_none()

    async def get_by_email(self, email: str) -> User | None:
        result = await self.session.execute(
            select(User).where(User.email == email)
        )
        return result.scalar_one_or_none()

    async def list_active(self) -> list[User]:
        result = await self.session.execute(
            select(User).where(User.active.is_(True)).order_by(User.name)
        )
        return list(result.scalars().all())

    async def update(self, user_id: str, fields: dict) -> User | None:
        user = await self.get_by_id(user_id)
        if user is None:
            return None
        for k, v in fields.items():
            setattr(user, k, v)
        return user
```

- [ ] **Step 4: Create `backend/app/repositories/incident_repository.py`**

```python
from __future__ import annotations
import uuid
from datetime import datetime, timedelta
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from ..models.incident import Incident
from ..models.incident_event import IncidentEvent
from ..schemas.incident import IncidentCreate
from ..config import app_config
from ..services.numbering import next_incident_number


def _sla_due(priority: int, created_at: datetime) -> datetime:
    hours = app_config.priorities[priority - 1].sla_hours
    return created_at + timedelta(hours=hours)


class IncidentRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(self, data: IncidentCreate) -> Incident:
        now = datetime.utcnow()
        number = await next_incident_number(self.session)
        incident = Incident(
            id=str(uuid.uuid4()),
            number=number,
            title=data.title,
            description=data.description,
            state=data.state,
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

    async def list(
        self,
        state: str | None = None,
        priority: int | None = None,
        assignee_id: str | None = None,
        requester_id: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[Incident]:
        q = select(Incident)
        if state is not None:
            q = q.where(Incident.state == state)
        if priority is not None:
            q = q.where(Incident.priority == priority)
        if assignee_id is not None:
            q = q.where(Incident.assignee_id == assignee_id)
        if requester_id is not None:
            q = q.where(Incident.requester_id == requester_id)
        q = q.order_by(Incident.created_at.desc()).limit(limit).offset(offset)
        result = await self.session.execute(q)
        return list(result.scalars().all())

    async def update(self, incident_id: str, fields: dict) -> Incident | None:
        incident = await self.get_by_id(incident_id)
        if incident is None:
            return None
        for k, v in fields.items():
            setattr(incident, k, v)
        incident.updated_at = datetime.utcnow()
        return incident
```

Note: `Incident.events` requires a relationship to be defined. Add to `backend/app/models/incident.py`:

```python
# Add after existing imports:
from sqlalchemy.orm import relationship

# Add inside the Incident class body (after all mapped_column lines):
events: Mapped[list["IncidentEvent"]] = relationship(  # type: ignore[name-defined]
    "IncidentEvent", foreign_keys="[IncidentEvent.incident_id]", lazy="raise"
)
attachments: Mapped[list["Attachment"]] = relationship(  # type: ignore[name-defined]
    "Attachment", foreign_keys="[Attachment.incident_id]", lazy="raise"
)
```

- [ ] **Step 5: Create `backend/app/repositories/incident_event_repository.py`**

```python
from __future__ import annotations
import uuid
from sqlalchemy import select
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

    async def list_for_incident(self, incident_id: str) -> list[IncidentEvent]:
        result = await self.session.execute(
            select(IncidentEvent)
            .where(IncidentEvent.incident_id == incident_id)
            .order_by(IncidentEvent.created_at.asc())
        )
        return list(result.scalars().all())
```

- [ ] **Step 6: Create `backend/app/repositories/attachment_repository.py`**

```python
from __future__ import annotations
import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from ..models.attachment import Attachment
from ..schemas.attachment import AttachmentCreate


class AttachmentRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(self, data: AttachmentCreate) -> Attachment:
        att = Attachment(
            id=str(uuid.uuid4()),
            incident_id=data.incident_id,
            filename=data.filename,
            mime_type=data.mime_type,
            size_bytes=data.size_bytes,
            blob_ref=data.blob_ref,
            uploaded_by=data.uploaded_by,
        )
        self.session.add(att)
        return att

    async def list_for_incident(self, incident_id: str) -> list[Attachment]:
        result = await self.session.execute(
            select(Attachment)
            .where(Attachment.incident_id == incident_id)
            .order_by(Attachment.uploaded_at.asc())
        )
        return list(result.scalars().all())

    async def get_by_id(self, attachment_id: str) -> Attachment | None:
        result = await self.session.execute(
            select(Attachment).where(Attachment.id == attachment_id)
        )
        return result.scalar_one_or_none()
```

- [ ] **Step 7: Update `backend/app/repositories/__init__.py`**

```python
from .user_repository import UserRepository
from .incident_repository import IncidentRepository
from .incident_event_repository import IncidentEventRepository
from .attachment_repository import AttachmentRepository

__all__ = [
    "UserRepository",
    "IncidentRepository",
    "IncidentEventRepository",
    "AttachmentRepository",
]
```

- [ ] **Step 8: Run all tests**

```
cd backend
uv run pytest tests/ -v
```
Expected: All tests in test_models, test_schemas, test_state_machine, test_numbering, test_repositories pass.

If `test_get_with_events` fails with `MissingGreenlet` error, verify the `events` relationship was added to `Incident` model with `lazy="raise"` and `selectinload` is used in `get_with_events()`.

- [ ] **Step 9: Commit**

```bash
git add backend/app/repositories/ backend/app/models/incident.py backend/tests/test_repositories.py
git commit -m "feat: add repositories for all ITSM entities"
```

---

## Task 6: Alembic Setup + Initial Migration

**Files:**
- Delete+recreate: `backend/alembic/` (using `alembic init -t async`)
- Create: `backend/alembic.ini` (via `alembic init`)
- Modify: `backend/alembic/env.py` (add Base + model imports + URL override)
- Create: `backend/alembic/versions/<hash>_initial.py` (via `alembic revision --autogenerate`)

All commands run from `backend/`.

---

- [ ] **Step 1: Remove the existing empty alembic directory and run `alembic init`**

The `alembic/` directory currently only has a `.gitkeep` file. `alembic init` fails if the directory already exists, so remove it first:

```powershell
# Run from backend/
Remove-Item -Recurse -Force alembic
uv run alembic init -t async alembic
```

Expected output:
```
Creating directory .../backend/alembic ...  done
Creating directory .../backend/alembic/versions ...  done
Generating .../backend/alembic.ini ...  done
Generating .../backend/alembic/env.py ...  done
Generating .../backend/alembic/README ...  done
Generating .../backend/alembic/script.py.mako ...  done
Please edit configuration/connection/logging settings in '.../alembic.ini' before proceeding.
```

- [ ] **Step 2: Configure `backend/alembic.ini` — set the default dev URL**

In `backend/alembic.ini`, change the line:
```
sqlalchemy.url = driver://user:pass@localhost/dbname
```
to:
```
sqlalchemy.url = sqlite+aiosqlite:///./dev.db
```

This is only a fallback — `env.py` will override it with `DATABASE_URL` from the environment.

- [ ] **Step 3: Replace `backend/alembic/env.py` with the async + model-aware version**

Overwrite the generated `backend/alembic/env.py` entirely with:

```python
from __future__ import annotations
import asyncio
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context

# Import app config to get DATABASE_URL
from app.config import env_settings

# Import Base and ALL models so they register with Base.metadata before autogenerate
from app.db import Base
import app.models  # noqa: F401 — registers User, Incident, IncidentEvent, Attachment

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Override the URL from the app's env settings so migrations always use the same DB
config.set_main_option("sqlalchemy.url", env_settings.database_url)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,  # required for SQLite ALTER TABLE support
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        render_as_batch=True,  # required for SQLite ALTER TABLE support
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```

Note: `render_as_batch=True` is required for SQLite because SQLite doesn't support `ALTER TABLE ... ADD COLUMN` with constraints — Alembic's batch mode rewrites the table instead.

- [ ] **Step 4: Generate the initial migration**

```
cd backend
uv run alembic revision --autogenerate -m "initial"
```

Expected output:
```
INFO  [alembic.runtime.migration] Context impl SQLiteImpl.
INFO  [alembic.runtime.migration] Will assume non-transactional DDL.
INFO  [alembic.autogenerate.compare] Detected added table 'users'
INFO  [alembic.autogenerate.compare] Detected added table 'incidents'
INFO  [alembic.autogenerate.compare] Detected added table 'incident_events'
INFO  [alembic.autogenerate.compare] Detected added table 'attachments'
Generating .../backend/alembic/versions/<hash>_initial.py ...  done
```

If you see "No changes detected" instead, the models aren't registered. Check that `import app.models` is in `env.py` and that `app/models/__init__.py` imports all 4 models.

- [ ] **Step 5: Add HANA sequence to the migration**

Open the generated `backend/alembic/versions/<hash>_initial.py`. At the bottom of the `upgrade()` function, after all `op.create_table(...)` calls, add:

```python
    # HANA-only: create incident number sequence
    bind = op.get_bind()
    if bind.dialect.name == "hana":
        op.execute("CREATE SEQUENCE ITSM_INC_SEQ START WITH 1 INCREMENT BY 1")
```

And at the bottom of `downgrade()`, add:
```python
    bind = op.get_bind()
    if bind.dialect.name == "hana":
        op.execute("DROP SEQUENCE IF EXISTS ITSM_INC_SEQ")
```

- [ ] **Step 6: Apply the migration**

```
cd backend
uv run alembic upgrade head
```

Expected output:
```
INFO  [alembic.runtime.migration] Context impl SQLiteImpl.
INFO  [alembic.runtime.migration] Will assume non-transactional DDL.
INFO  [alembic.runtime.migration] Running upgrade  -> <hash>, initial
```

Verify `dev.db` was created:
```powershell
Test-Path dev.db  # should output True
```

- [ ] **Step 7: Commit**

```bash
git add backend/alembic/ backend/alembic.ini
git commit -m "feat: initialize Alembic async migrations with initial 4-table schema"
```

---

## Task 7: Seed Script + Verification

**Files:**
- Create: `backend/scripts/__init__.py`
- Create: `backend/scripts/seed_dev.py`

---

- [ ] **Step 1: Create `backend/scripts/__init__.py`** (empty)

- [ ] **Step 2: Create `backend/scripts/seed_dev.py`**

```python
"""
Dev seed script — inserts sample users, incidents, events, and one attachment.
Run from backend/: uv run python scripts/seed_dev.py
"""
from __future__ import annotations
import asyncio
import uuid
from datetime import datetime, timedelta
from sqlalchemy import text

from app.db import AsyncSessionLocal, engine, Base
from app.models.user import User
from app.models.incident import Incident
from app.models.incident_event import IncidentEvent
from app.models.attachment import Attachment
from app.services.numbering import next_incident_number
from app.config import app_config


def _utcnow() -> datetime:
    return datetime.utcnow()


async def seed() -> None:
    async with AsyncSessionLocal() as session:
        async with session.begin():
            # --- Users ---
            admin = User(
                id=str(uuid.uuid4()),
                email="admin@acme.com",
                name="Alex Admin",
                role="admin",
            )
            agent = User(
                id=str(uuid.uuid4()),
                email="sarah.chen@acme.com",
                name="Sarah Chen",
                role="agent",
            )
            requester = User(
                id=str(uuid.uuid4()),
                email="james.park@acme.com",
                name="James Park",
                role="requester",
            )
            session.add_all([admin, agent, requester])
            await session.flush()

            # --- Incidents ---
            async def make_incident(title, description, priority, category, source, state, assignee=None):
                now = _utcnow()
                number = await next_incident_number(session)
                sla_hours = app_config.priorities[priority - 1].sla_hours
                inc = Incident(
                    id=str(uuid.uuid4()),
                    number=number,
                    title=title,
                    description=description,
                    state=state,
                    priority=priority,
                    category=category,
                    source=source,
                    requester_id=requester.id,
                    assignee_id=assignee.id if assignee else None,
                    sla_resolution_due=now + timedelta(hours=sla_hours),
                    created_at=now,
                    updated_at=now,
                )
                session.add(inc)
                await session.flush()
                return inc

            inc1 = await make_incident(
                "VPN not connecting",
                "Since yesterday morning I cannot connect to the corporate VPN. Error: 'Connection timed out'.",
                priority=2, category="Network", source="web", state="assigned", assignee=agent,
            )
            inc2 = await make_incident(
                "Outlook crashes on startup",
                "Outlook 365 crashes immediately when launched. Happens on my laptop and my desk machine.",
                priority=3, category="Software", source="web", state="in_progress", assignee=agent,
            )
            inc3 = await make_incident(
                "Cannot access SAP S/4HANA after password reset",
                "My SAP account is locked after a forced password reset. IT reset it but I still cannot log in.",
                priority=1, category="SAP Integration", source="email", state="new",
            )
            inc4 = await make_incident(
                "Laptop keyboard unresponsive",
                "Several keys on my laptop keyboard stopped working after a coffee spill.",
                priority=3, category="Hardware", source="web", state="resolved", assignee=agent,
            )
            inc5 = await make_incident(
                "Printer offline in Building A",
                "The HP LaserJet on the 3rd floor shows offline. Multiple people affected.",
                priority=4, category="Hardware", source="web", state="closed",
            )

            # Update resolved/closed timestamps for inc4 and inc5
            inc4.resolution_code = "hardware_replaced"
            inc4.resolution_notes = "Keyboard replaced under warranty. User confirmed working."
            inc4.resolved_at = _utcnow() - timedelta(hours=2)
            inc5.resolution_code = "configuration_change"
            inc5.resolution_notes = "Printer driver updated and print spooler restarted."
            inc5.resolved_at = _utcnow() - timedelta(days=1)
            inc5.closed_at = _utcnow() - timedelta(hours=20)

            await session.flush()

            # --- Events ---
            async def add_event(incident, actor, event_type, body, metadata=None):
                ev = IncidentEvent(
                    id=str(uuid.uuid4()),
                    incident_id=incident.id,
                    actor_id=actor.id,
                    event_type=event_type,
                    body=body,
                    event_metadata=metadata,
                )
                session.add(ev)
                await session.flush()
                return ev

            # inc1 events
            await add_event(inc1, requester, "comment", "Still not working. Tried restarting my machine.")
            await add_event(inc1, agent, "state_change", "Assigned to myself, will investigate.",
                            {"old_state": "new", "new_state": "assigned"})
            await add_event(inc1, agent, "work_note", "Checked firewall rules. No recent changes. Escalating to network team.")

            # inc2 events
            await add_event(inc2, requester, "comment", "It also crashes when I try to open it in safe mode.")
            await add_event(inc2, agent, "state_change", "Started investigation.",
                            {"old_state": "assigned", "new_state": "in_progress"})
            await add_event(inc2, agent, "work_note", "Office repair tool running. Will update when complete.")

            # inc3 events
            await add_event(inc3, requester, "comment", "This is urgent — I cannot process invoices without SAP access.")

            # inc4 events
            await add_event(inc4, agent, "state_change", "Resolved — keyboard replaced.",
                            {"old_state": "in_progress", "new_state": "resolved"})
            await add_event(inc4, requester, "comment", "Confirmed working, thank you!")

            # inc5 events
            await add_event(inc5, agent, "state_change", "Resolved.",
                            {"old_state": "in_progress", "new_state": "resolved"})
            await add_event(inc5, admin, "state_change", "Closed after 24-hour verification period.",
                            {"old_state": "resolved", "new_state": "closed"})

            # --- One Attachment ---
            att = Attachment(
                id=str(uuid.uuid4()),
                incident_id=inc1.id,
                filename="vpn_error_screenshot.png",
                mime_type="image/png",
                size_bytes=87432,
                blob_ref="./uploads/vpn_error_screenshot.png",
                uploaded_by=requester.id,
            )
            session.add(att)
            await session.flush()

    print("Seed complete.")
    print(f"  Users:    3  (admin@acme.com, sarah.chen@acme.com, james.park@acme.com)")
    print(f"  Incidents: 5  ({inc1.number} … {inc5.number})")
    print(f"  Events:   11")
    print(f"  Attachments: 1  (on {inc1.number})")


if __name__ == "__main__":
    asyncio.run(seed())
```

- [ ] **Step 3: Run the seed script**

```
cd backend
uv run python scripts/seed_dev.py
```

Expected output:
```
Seed complete.
  Users:    3  (admin@acme.com, sarah.chen@acme.com, james.park@acme.com)
  Incidents: 5  (INC0000001 … INC0000005)
  Events:   11
  Attachments: 1  (on INC0000001)
```

- [ ] **Step 4: Verify with a quick query**

```
cd backend
uv run python -c "
import asyncio
from sqlalchemy import select, text
from app.db import AsyncSessionLocal
from app.models.incident import Incident

async def show():
    async with AsyncSessionLocal() as s:
        r = await s.execute(select(Incident).order_by(Incident.number))
        rows = r.scalars().all()
        print(f'{'Number':<12} {'State':<12} {'Priority':<10} {'Title'}")
        print('-' * 65)
        for i in rows:
            print(f'{i.number:<12} {i.state:<12} {i.priority:<10} {i.title[:35]}')

asyncio.run(show())
"
```

Expected output:
```
Number       State        Priority   Title
-----------------------------------------------------------------
INC0000001   assigned     2          VPN not connecting
INC0000002   in_progress  3          Outlook crashes on startup
INC0000003   new          1          Cannot access SAP S/4HANA afte
INC0000004   resolved     3          Laptop keyboard unresponsive
INC0000005   closed       4          Printer offline in Building A
```

- [ ] **Step 5: Commit**

```bash
git add backend/scripts/ backend/tests/
git commit -m "feat: add seed script with sample users, incidents, events, and attachment"
```

---

## Self-Review

**Spec coverage check:**

| Requirement | Task |
|-------------|------|
| `users` table with all columns | Task 1 |
| `incidents` table with all columns | Task 1 |
| `incident_events` table with event_type discriminator + metadata JSON | Task 1 |
| `attachments` table | Task 1 |
| Pydantic schemas Create/Update/Response | Task 2 |
| State validation (against config.yaml states) | Task 2 schema + Task 3 |
| Priority validation (1-4) | Task 2 |
| Category validation (against config.yaml) | Task 2 |
| `can_transition()` | Task 3 |
| `validate_transition()` with required fields | Task 3 |
| resolved requires resolution_code + resolution_notes | Task 3 |
| `next_incident_number()` SQLite branch | Task 4 |
| `next_incident_number()` HANA branch | Task 4 |
| Repositories: user CRUD | Task 5 |
| Repositories: incident CRUD + list filters | Task 5 |
| Repositories: incident get_with_events | Task 5 |
| Repositories: event list_for_incident | Task 5 |
| Repositories: attachment list | Task 5 |
| Alembic async init + autogenerate | Task 6 |
| HANA sequence in migration | Task 6 |
| Seed: 3 users | Task 7 |
| Seed: 5 incidents with realistic data | Task 7 |
| Seed: events per incident | Task 7 |
| Seed: 1 attachment | Task 7 |
| Verification query | Task 7 |

All requirements covered. ✓

**Placeholder scan:** No TBD, no "implement later", no empty steps. ✓

**Type consistency:**
- `event_metadata` used consistently in model, schema, and repository. ✓
- `next_incident_number(session)` signature consistent in Task 4 (definition) and Task 5 (use in IncidentRepository) and Task 7 (seed). ✓
- `IncidentEventCreate.event_metadata` maps to `IncidentEvent.event_metadata`. ✓
- `_sla_due(priority, created_at)` defined and used only in `incident_repository.py`. ✓
