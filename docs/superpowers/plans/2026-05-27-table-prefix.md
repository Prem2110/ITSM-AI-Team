# Table Prefix Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `TABLE_PREFIX` env var that prepends a configurable string to every SQLAlchemy table name, FK reference, constraint name, explicit index name, and HANA sequence — defaulting to empty (no-op) for production.

**Architecture:** A `tbl(name)` helper in `app/config.py` concatenates `env_settings.table_prefix + name`. All model `__tablename__` values, FK strings, and explicit index names call `tbl()` at class-definition time. A `MetaData(naming_convention=...)` on `Base` ensures auto-generated constraint names also carry the prefix via `%(table_name)s` expansion. The migration is deleted and regenerated so table names are baked in from the current prefix at generation time.

**Tech Stack:** Python 3.11, FastAPI, SQLAlchemy 2.0 async, Alembic, pydantic-settings 2, SQLite (dev/test), SAP HANA (prod)

---

## File Map

| File | Action | What changes |
|------|--------|-------------|
| `backend/app/config.py` | Modify | Add `table_prefix: str = ""` to `EnvSettings`; add `tbl()` helper after singleton |
| `backend/app/db.py` | Modify | Add `MetaData(naming_convention=...)` to `Base` |
| `backend/app/models/user.py` | Modify | `__tablename__ = tbl("users")` |
| `backend/app/models/incident.py` | Modify | `__tablename__`, two FK strings |
| `backend/app/models/incident_event.py` | Modify | `__tablename__`, explicit index name, two FK strings |
| `backend/app/models/attachment.py` | Modify | `__tablename__`, two FK strings |
| `backend/app/services/numbering.py` | Modify | HANA sequence name via `tbl("INC_SEQ")` |
| `backend/alembic/versions/655a7884ea67_initial.py` | Delete | Replaced by regenerated migration |
| `backend/.env.example` | Modify | Add `TABLE_PREFIX=` with comment |
| `README.md` | Modify | Add "Table prefix" section |
| `backend/tests/test_config.py` | Create | Unit tests for `tbl()` |

---

## Task 1: Tests for `tbl()` — write failing tests first

**Files:**
- Create: `backend/tests/test_config.py`

- [ ] **Step 1: Create the test file**

```python
# backend/tests/test_config.py
from __future__ import annotations
import pytest


def test_tbl_empty_prefix_returns_bare_name():
    """With default empty prefix, tbl() is a no-op."""
    from app.config import tbl
    assert tbl("users") == "users"
    assert tbl("incidents") == "incidents"
    assert tbl("incident_events") == "incident_events"
    assert tbl("attachments") == "attachments"
    assert tbl("INC_SEQ") == "INC_SEQ"


def test_tbl_with_prefix_prepends_exactly(monkeypatch):
    """Prefix is prepended with no separator artifact."""
    import app.config as cfg
    monkeypatch.setattr(cfg.env_settings, "table_prefix", "ITSM_DEV_")
    assert cfg.tbl("users") == "ITSM_DEV_users"
    assert cfg.tbl("incidents") == "ITSM_DEV_incidents"
    assert cfg.tbl("INC_SEQ") == "ITSM_DEV_INC_SEQ"


def test_tbl_underscore_suffix_prefix_no_double_separator(monkeypatch):
    """Prefix ending in _ + name starting with letter — no double separator."""
    import app.config as cfg
    monkeypatch.setattr(cfg.env_settings, "table_prefix", "ITSM_PREM_")
    assert cfg.tbl("users") == "ITSM_PREM_users"


def test_tbl_empty_name_with_prefix(monkeypatch):
    """Empty name returns just the prefix (edge case, no artifact)."""
    import app.config as cfg
    monkeypatch.setattr(cfg.env_settings, "table_prefix", "ITSM_DEV_")
    assert cfg.tbl("") == "ITSM_DEV_"


def test_tbl_empty_prefix_empty_name():
    from app.config import tbl
    assert tbl("") == ""
```

- [ ] **Step 2: Run tests — expect ImportError or NameError on `tbl`**

```
cd backend
uv run pytest tests/test_config.py -v
```

Expected output contains: `ImportError: cannot import name 'tbl' from 'app.config'`

---

## Task 2: Implement `table_prefix` and `tbl()` in `config.py`

**Files:**
- Modify: `backend/app/config.py`

- [ ] **Step 1: Add `table_prefix` field to `EnvSettings` and `tbl()` helper**

Open `backend/app/config.py`. The current `EnvSettings` class ends at `cors_origins`. Add one field, then add the helper below the `env_settings` singleton:

```python
# ---- Env-var settings ----

class EnvSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(Path(__file__).parent.parent / ".env"),
        extra="ignore",
    )

    database_url: str = "sqlite+aiosqlite:///./dev.db"
    auth_mode: Literal["fake", "real"] = "fake"
    xsuaa_url: str = ""
    xsuaa_client_id: str = ""
    xsuaa_client_secret: str = ""
    xsuaa_xsappname: str = ""
    cors_origins: list[str] = ["*"]
    table_prefix: str = ""          # NEW — e.g. "ITSM_DEV_", empty in production
```

Then after the line `env_settings: EnvSettings = EnvSettings()`, add:

```python
def tbl(name: str) -> str:
    """Prefix a table or object name with TABLE_PREFIX (empty = no-op)."""
    return env_settings.table_prefix + name
```

The full bottom of the file becomes:

```python
# Singletons loaded at import time
app_config: AppConfig = _load_yaml_config()
env_settings: EnvSettings = EnvSettings()


def tbl(name: str) -> str:
    """Prefix a table or object name with TABLE_PREFIX (empty = no-op)."""
    return env_settings.table_prefix + name
```

- [ ] **Step 2: Run the new tests — expect all 5 to pass**

```
cd backend
uv run pytest tests/test_config.py -v
```

Expected output:
```
PASSED tests/test_config.py::test_tbl_empty_prefix_returns_bare_name
PASSED tests/test_config.py::test_tbl_with_prefix_prepends_exactly
PASSED tests/test_config.py::test_tbl_underscore_suffix_prefix_no_double_separator
PASSED tests/test_config.py::test_tbl_empty_name_with_prefix
PASSED tests/test_config.py::test_tbl_empty_prefix_empty_name
5 passed
```

- [ ] **Step 3: Run the full test suite — all existing tests must still pass**

```
cd backend
uv run pytest -v
```

Expected: all previously passing tests still pass (87 + 5 new = 92 total).

- [ ] **Step 4: Commit**

```
git add backend/app/config.py backend/tests/test_config.py
git commit -m "feat: add table_prefix to EnvSettings and tbl() helper"
```

---

## Task 3: Add `MetaData` naming convention to `Base`

**Files:**
- Modify: `backend/app/db.py`

This ensures auto-generated constraint names (FKs, PKs, unique constraints, indexes created via `index=True` on a column) carry the table name — which already includes the prefix when `TABLE_PREFIX` is set.

- [ ] **Step 1: Update `db.py`**

Replace the entire current `Base` class definition. The full updated file:

```python
from __future__ import annotations
from collections.abc import AsyncGenerator
from sqlalchemy import MetaData
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from .config import env_settings

_naming_convention: dict[str, str] = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


engine = create_async_engine(
    env_settings.database_url,
    echo=False,
    connect_args={"check_same_thread": False} if "sqlite" in env_settings.database_url else {},
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=_naming_convention)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
```

- [ ] **Step 2: Run the full test suite — all tests must still pass**

```
cd backend
uv run pytest -v
```

The naming convention only affects how Alembic autogenerates migration code and how SQLAlchemy names constraints in DDL. In-memory SQLite tests using `Base.metadata.create_all` will work fine — SQLite accepts any constraint name.

Expected: same pass count as before (92 tests).

- [ ] **Step 3: Commit**

```
git add backend/app/db.py
git commit -m "feat: add naming_convention to Base.metadata for prefix-aware constraint names"
```

---

## Task 4: Update all four model files

**Files:**
- Modify: `backend/app/models/user.py`
- Modify: `backend/app/models/incident.py`
- Modify: `backend/app/models/incident_event.py`
- Modify: `backend/app/models/attachment.py`

All four models currently have hardcoded string `__tablename__` values and hardcoded FK strings. Replace them with `tbl()` calls.

- [ ] **Step 1: Update `user.py`**

```python
from __future__ import annotations
import uuid
from datetime import datetime
from sqlalchemy import String, Boolean, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from ..db import Base
from ..config import tbl
from ..utils import utcnow


class User(Base):
    __tablename__ = tbl("users")

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(50), nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)
```

- [ ] **Step 2: Update `incident.py`**

```python
from __future__ import annotations
import uuid
from datetime import datetime
from typing import TYPE_CHECKING
from sqlalchemy import String, Boolean, DateTime, Text, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from ..db import Base
from ..config import tbl
from ..utils import utcnow

if TYPE_CHECKING:
    from .user import User


class Incident(Base):
    __tablename__ = tbl("incidents")

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    number: Mapped[str] = mapped_column(String(20), unique=True, index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    state: Mapped[str] = mapped_column(String(50), nullable=False, default="new")
    priority: Mapped[int] = mapped_column(Integer, nullable=False)
    category: Mapped[str] = mapped_column(String(100), nullable=False)
    source: Mapped[str] = mapped_column(String(50), nullable=False)
    requester_id: Mapped[str] = mapped_column(String(36), ForeignKey(tbl("users") + ".id"), nullable=False, index=True)
    assignee_id: Mapped[str | None] = mapped_column(String(36), ForeignKey(tbl("users") + ".id"), nullable=True, index=True)
    resolution_code: Mapped[str | None] = mapped_column(String(100), nullable=True)
    resolution_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    sla_resolution_due: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sla_breached: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    assignee: Mapped["User | None"] = relationship(
        "User", foreign_keys=[assignee_id], lazy="raise"
    )
    events: Mapped[list["IncidentEvent"]] = relationship(
        "IncidentEvent", foreign_keys="[IncidentEvent.incident_id]", lazy="raise"
    )
    attachments: Mapped[list["Attachment"]] = relationship(
        "Attachment", foreign_keys="[Attachment.incident_id]", lazy="raise"
    )
```

- [ ] **Step 3: Update `incident_event.py`**

The explicit `Index` name uses an f-string calling `tbl()`. Note: this f-string evaluates at class-definition time (Python executes class bodies immediately on import), so the index name is fixed for the lifetime of the process — matching the `__tablename__`.

```python
from __future__ import annotations
import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, Text, ForeignKey, JSON, Index
from sqlalchemy.orm import Mapped, mapped_column
from ..db import Base
from ..config import tbl
from ..utils import utcnow


class IncidentEvent(Base):
    __tablename__ = tbl("incident_events")
    __table_args__ = (
        Index(f"ix_{tbl('incident_events')}_incident_created", "incident_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    incident_id: Mapped[str] = mapped_column(String(36), ForeignKey(tbl("incidents") + ".id"), nullable=False)
    actor_id: Mapped[str] = mapped_column(String(36), ForeignKey(tbl("users") + ".id"), nullable=False)
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    event_metadata: Mapped[dict | None] = mapped_column("metadata", JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
```

- [ ] **Step 4: Update `attachment.py`**

```python
from __future__ import annotations
import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from ..db import Base
from ..config import tbl
from ..utils import utcnow


class Attachment(Base):
    __tablename__ = tbl("attachments")

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    incident_id: Mapped[str] = mapped_column(String(36), ForeignKey(tbl("incidents") + ".id"), nullable=False, index=True)
    filename: Mapped[str] = mapped_column(String(500), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    blob_ref: Mapped[str] = mapped_column(String(1000), nullable=False)
    uploaded_by: Mapped[str] = mapped_column(String(36), ForeignKey(tbl("users") + ".id"), nullable=False, index=True)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
```

- [ ] **Step 5: Run the full test suite — all tests must still pass**

```
cd backend
uv run pytest -v
```

With `TABLE_PREFIX` unset (default `""`), `tbl("users")` returns `"users"`, which matches the in-memory SQLite tables created by `Base.metadata.create_all`. The behaviour is identical to before.

Expected: 92 tests pass.

- [ ] **Step 6: Commit**

```
git add backend/app/models/user.py backend/app/models/incident.py \
        backend/app/models/incident_event.py backend/app/models/attachment.py
git commit -m "feat: use tbl() for __tablename__ and FK strings in all models"
```

---

## Task 5: Update `numbering.py` — prefix the HANA sequence name

**Files:**
- Modify: `backend/app/services/numbering.py`

The HANA sequence name changes from the hardcoded `ITSM_INC_SEQ` to `tbl("INC_SEQ")`. With an empty prefix this becomes `INC_SEQ`; with `ITSM_DEV_` it becomes `ITSM_DEV_INC_SEQ`.

- [ ] **Step 1: Update `numbering.py`**

```python
from __future__ import annotations
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession
from ..models.incident import Incident
from ..config import app_config, env_settings, tbl


async def next_incident_number(session: AsyncSession) -> str:
    """Return the next incident number string (e.g. 'INC0000042').

    SQLite: MAX(number) + 1 inside the current transaction.
    HANA:   DB sequence {tbl('INC_SEQ')} created by the initial migration.
    """
    prefix = app_config.number_prefix
    db_url = env_settings.database_url.lower()

    if "hana" in db_url or "hdbcli" in db_url:
        seq_name = tbl("INC_SEQ")
        result = await session.execute(text(f"SELECT {seq_name}.NEXTVAL FROM DUMMY"))
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

- [ ] **Step 2: Run numbering tests**

```
cd backend
uv run pytest tests/test_numbering.py -v
```

Expected:
```
PASSED tests/test_numbering.py::test_first_number_is_one
PASSED tests/test_numbering.py::test_second_number_increments
PASSED tests/test_numbering.py::test_number_format_is_zero_padded
3 passed
```

(SQLite path unchanged; HANA path not exercised in tests — HANA case-folding for the sequence name is a follow-up noted in the spec.)

- [ ] **Step 3: Commit**

```
git add backend/app/services/numbering.py
git commit -m "feat: prefix HANA sequence name via tbl()"
```

---

## Task 6: Delete old migration and regenerate

**Files:**
- Delete: `backend/alembic/versions/655a7884ea67_initial.py`
- Create: `backend/alembic/versions/<new_hash>_initial.py` (generated, then patched)

The old migration has hardcoded unprefixed table names. Delete it; the new one is generated from `Base.metadata` — which now carries `tbl()`-resolved names — then patched to add the HANA sequence block using `tbl()`.

- [ ] **Step 1: Delete the old migration**

```
cd backend
del alembic\versions\655a7884ea67_initial.py
```

(On Linux/Mac: `rm alembic/versions/655a7884ea67_initial.py`)

- [ ] **Step 2: Drop the dev database**

```
del dev.db
```

(On Linux/Mac: `rm -f dev.db`)

- [ ] **Step 3: Generate new migration with empty prefix**

Ensure `TABLE_PREFIX` is not set (or is empty) in your environment and in `backend/.env`. Then:

```
cd backend
uv run alembic revision --autogenerate -m "initial"
```

A new file `alembic/versions/<hash>_initial.py` is created. Note the filename — you will edit it in the next step.

The generated upgrade function will look similar to:

```python
def upgrade() -> None:
    op.create_table('users',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('email', sa.String(length=255), nullable=False),
    sa.Column('name', sa.String(length=255), nullable=False),
    sa.Column('role', sa.String(length=50), nullable=False),
    sa.Column('active', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_users')),
    )
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_users_email'), ['email'], unique=True)

    op.create_table('incidents', ...)
    # ... etc.
```

Note: the generated migration will NOT have the HANA sequence block — that is added manually in the next step.

- [ ] **Step 4: Patch the HANA sequence block into the generated migration**

Open the generated file. At the top of the file, after the existing imports, add:

```python
from app.config import tbl
```

At the end of the `upgrade()` function, before `# ### end Alembic commands ###`, add:

```python
    # HANA-only: create incident number sequence
    bind = op.get_bind()
    if bind.dialect.name == "hana":
        op.execute(f"CREATE SEQUENCE {tbl('INC_SEQ')} START WITH 1 INCREMENT BY 1")
```

At the end of the `downgrade()` function, before `# ### end Alembic commands ###`, add:

```python
    bind = op.get_bind()
    if bind.dialect.name == "hana":
        op.execute(f"DROP SEQUENCE IF EXISTS {tbl('INC_SEQ')}")
```

- [ ] **Step 5: Apply the migration to confirm it runs cleanly**

```
cd backend
uv run alembic upgrade head
```

Expected output (no errors):
```
INFO  [alembic.runtime.migration] Running upgrade  -> <hash>, initial
```

- [ ] **Step 6: Run the full test suite**

```
cd backend
uv run pytest -v
```

Expected: 92 tests pass.

- [ ] **Step 7: Commit**

```
git add backend/alembic/versions/
git commit -m "feat: regenerate initial migration with naming_convention and prefixed HANA sequence"
```

---

## Task 7: Update `.env.example` and README

**Files:**
- Modify: `backend/.env.example`
- Modify: `README.md`

- [ ] **Step 1: Update `backend/.env.example`**

Replace the current content with:

```
# Database
DATABASE_URL=sqlite+aiosqlite:///./dev.db

# Auth mode: fake (local dev) or real (SAP BTP with XSUAA)
AUTH_MODE=fake

# XSUAA configuration (required when AUTH_MODE=real)
XSUAA_URL=
XSUAA_CLIENT_ID=
XSUAA_CLIENT_SECRET=
XSUAA_XSAPPNAME=

# CORS allowed origins (comma-separated in env var or wildcard for dev)
# Example for production: CORS_ORIGINS=["https://itsm.yourdomain.com"]
CORS_ORIGINS=["*"]

# Table name prefix — prepended to every table, index, constraint, and HANA sequence name.
# Use when sharing a schema with other workloads (e.g. a shared dev HDI Container).
# Examples: TABLE_PREFIX=ITSM_DEV_   TABLE_PREFIX=ITSM_PREM_   TABLE_PREFIX=
# Production deployments with a dedicated HDI Container: leave empty (no prefix needed).
# NOTE: leave empty (or unset) when running tests — tests expect unprefixed table names.
TABLE_PREFIX=
```

- [ ] **Step 2: Add a "Table prefix" section to `README.md`**

Find the section after "Running Locally" (or at the end of the file if no obvious place). Add:

```markdown
## Table Prefix

The `TABLE_PREFIX` environment variable prepends a string to every table name, index, constraint name, and HANA sequence used by the backend. This is used to avoid naming collisions when multiple ITSM deployments share a single HANA schema (common in shared-schema dev environments).

| Scenario | `TABLE_PREFIX` | Tables created |
|----------|----------------|----------------|
| Production (dedicated HDI Container) | *(empty)* | `users`, `incidents`, … |
| Shared dev schema — personal sandbox | `ITSM_PREM_` | `ITSM_PREM_users`, `ITSM_PREM_incidents`, … |
| Shared dev schema — team dev | `ITSM_DEV_` | `ITSM_DEV_users`, `ITSM_DEV_incidents`, … |

### Changing the prefix

The prefix is baked into the migration at generation time. To use a new prefix:

1. Drop all existing tables (or use a fresh schema).
2. Delete all files in `backend/alembic/versions/`.
3. Set `TABLE_PREFIX=<new_prefix>` in your environment.
4. Regenerate: `uv run alembic revision --autogenerate -m "initial"`
5. Patch the HANA sequence block into the generated migration (see `docs/superpowers/plans/2026-05-27-table-prefix.md` Task 6, Step 4).
6. Apply: `uv run alembic upgrade head`

**Do not** change the prefix on a running deployment — this would leave the old tables orphaned and create new empty ones.

### Tests

Tests always run with `TABLE_PREFIX=""` (the default). Ensure `backend/.env` does not set `TABLE_PREFIX` to a non-empty value — pydantic-settings reads `.env` at import time, and a non-empty prefix in `.env` will cause all 87 tests to fail with "no such table" errors.
```

- [ ] **Step 3: Commit**

```
git add backend/.env.example README.md
git commit -m "docs: add TABLE_PREFIX to .env.example and README"
```

---

## Task 8: End-to-end verification

No code changes in this task — run the verification sequence and confirm all outputs match expectations.

### 8a — Confirm `alembic/env.py` needs no changes

- [ ] **Open `backend/alembic/env.py` and verify it is unchanged**

The file already does two things that make it prefix-aware automatically:

1. `from app.config import env_settings` — reads `DATABASE_URL` (unchanged)
2. `import app.models` — imports all models, which registers their `tbl()`-resolved `__tablename__` values into `Base.metadata`

When Alembic runs with `TABLE_PREFIX=ITSM_TEST_`, `Base.metadata` already contains `ITSM_TEST_users`, `ITSM_TEST_incidents`, etc. Autogenerate reads those names directly. No changes to `env.py` are required or should be made.

**Expected:** `git diff backend/alembic/env.py` shows no changes.

### 8b — Empty prefix

- [ ] **Drop dev.db and confirm tables are unprefixed**

```
cd backend
del dev.db
uv run alembic upgrade head
```

Open SQLite and inspect:

```
sqlite3 dev.db ".tables"
```

Expected output (4 tables, no prefix):
```
attachments     incident_events  incidents  users
```

```
sqlite3 dev.db ".schema users"
```

Expected output includes:
```sql
CREATE TABLE users (
    id VARCHAR(36) NOT NULL,
    ...
    CONSTRAINT pk_users PRIMARY KEY (id)
);
CREATE UNIQUE INDEX ix_users_email ON users (email);
```

```
sqlite3 dev.db ".schema incidents"
```

Expected: contains `CONSTRAINT pk_incidents`, `CONSTRAINT fk_incidents_requester_id_users`, `CONSTRAINT fk_incidents_assignee_id_users`, index names `ix_incidents_number`, `ix_incidents_requester_id`, `ix_incidents_assignee_id`.

```
sqlite3 dev.db ".schema incident_events"
```

Expected: index name `ix_incident_events_incident_created`.

### 8b — `ITSM_TEST_` prefix

- [ ] **Regenerate migration with prefix, confirm all identifiers are prefixed**

```
cd backend
del alembic\versions\*.py
```

Set `TABLE_PREFIX=ITSM_TEST_` in your shell (do NOT write it to `.env` — that would break tests):

**Windows PowerShell:**
```powershell
$env:TABLE_PREFIX = "ITSM_TEST_"
uv run alembic revision --autogenerate -m "initial"
```

Open the newly generated migration file and apply the same HANA sequence patch as in Task 6:

At the top, after existing imports:
```python
from app.config import tbl
```

At the end of `upgrade()`, before `# ### end Alembic commands ###`:
```python
    # HANA-only: create incident number sequence
    bind = op.get_bind()
    if bind.dialect.name == "hana":
        op.execute(f"CREATE SEQUENCE {tbl('INC_SEQ')} START WITH 1 INCREMENT BY 1")
```

At the end of `downgrade()`, before `# ### end Alembic commands ###`:
```python
    bind = op.get_bind()
    if bind.dialect.name == "hana":
        op.execute(f"DROP SEQUENCE IF EXISTS {tbl('INC_SEQ')}")
```

```powershell
del dev.db
uv run alembic upgrade head
```

Inspect:

```powershell
sqlite3 dev.db ".tables"
```

Expected (all 4 tables prefixed):
```
ITSM_TEST_attachments     ITSM_TEST_incident_events  ITSM_TEST_incidents  ITSM_TEST_users
```

```powershell
sqlite3 dev.db ".schema ITSM_TEST_users"
```

Expected includes:
```sql
CREATE TABLE ITSM_TEST_users (
    ...
    CONSTRAINT pk_ITSM_TEST_users PRIMARY KEY (id)
);
CREATE UNIQUE INDEX ix_ITSM_TEST_users_email ON ITSM_TEST_users (email);
```

```powershell
sqlite3 dev.db ".schema ITSM_TEST_incidents"
```

Expected: FK names contain `ITSM_TEST_`, e.g. `fk_ITSM_TEST_incidents_requester_id_ITSM_TEST_users`.

```powershell
sqlite3 dev.db ".schema ITSM_TEST_incident_events"
```

Expected: index name `ix_ITSM_TEST_incident_events_incident_created`.

### 8c — Test suite with empty prefix

- [ ] **Reset to empty prefix and run all 87 tests**

Restore the empty-prefix migration:

```powershell
$env:TABLE_PREFIX = ""
del alembic\versions\*.py
uv run alembic revision --autogenerate -m "initial"
```

Patch the HANA sequence block again. Then:

```
cd backend
uv run pytest -v
```

Expected: **92 tests pass** (87 original + 5 new `test_config.py` tests). Zero failures.

### 8d — Seed script with `ITSM_TEST_` prefix

- [ ] **Run seed with prefix — confirm data lands in prefixed tables**

```powershell
del dev.db
$env:TABLE_PREFIX = "ITSM_TEST_"
del alembic\versions\*.py
uv run alembic revision --autogenerate -m "initial"
```

Open the newly generated migration file and apply the HANA sequence patch:

At the top, after existing imports:
```python
from app.config import tbl
```

At the end of `upgrade()`, before `# ### end Alembic commands ###`:
```python
    # HANA-only: create incident number sequence
    bind = op.get_bind()
    if bind.dialect.name == "hana":
        op.execute(f"CREATE SEQUENCE {tbl('INC_SEQ')} START WITH 1 INCREMENT BY 1")
```

At the end of `downgrade()`, before `# ### end Alembic commands ###`:
```python
    bind = op.get_bind()
    if bind.dialect.name == "hana":
        op.execute(f"DROP SEQUENCE IF EXISTS {tbl('INC_SEQ')}")
```

Then:

```powershell
uv run alembic upgrade head
uv run python scripts/seed_dev.py
```

Expected seed output:
```
Seed complete.
  Users:    3  (admin@acme.com, sarah.chen@acme.com, james.park@acme.com)
  Incidents: 5  (INC0000001 … INC0000005)
  Events:   11
  Attachments: 1  (on INC0000001)
```

Confirm data is in prefixed tables:

```powershell
sqlite3 dev.db "SELECT COUNT(*) FROM ITSM_TEST_users;"
sqlite3 dev.db "SELECT COUNT(*) FROM ITSM_TEST_incidents;"
```

Expected: `3` and `5`.

- [ ] **Restore empty prefix for day-to-day dev work**

```powershell
$env:TABLE_PREFIX = ""
del dev.db
del alembic\versions\*.py
uv run alembic revision --autogenerate -m "initial"
```

Open the newly generated migration file and apply the HANA sequence patch:

At the top, after existing imports:
```python
from app.config import tbl
```

At the end of `upgrade()`, before `# ### end Alembic commands ###`:
```python
    # HANA-only: create incident number sequence
    bind = op.get_bind()
    if bind.dialect.name == "hana":
        op.execute(f"CREATE SEQUENCE {tbl('INC_SEQ')} START WITH 1 INCREMENT BY 1")
```

At the end of `downgrade()`, before `# ### end Alembic commands ###`:
```python
    bind = op.get_bind()
    if bind.dialect.name == "hana":
        op.execute(f"DROP SEQUENCE IF EXISTS {tbl('INC_SEQ')}")
```

Then:

```powershell
uv run alembic upgrade head
uv run python scripts/seed_dev.py
```

Confirm tests still pass:

```
uv run pytest -v
```

Expected: 92 tests pass.

- [ ] **Final commit (if any files were left unstaged)**

```
git status
```

If clean: no commit needed. If stale `.pyc` or other artifacts: clean up, do not add generated migration files beyond what is already committed.

---

## Summary of all commits

| # | Message | Files |
|---|---------|-------|
| 1 | `feat: add table_prefix to EnvSettings and tbl() helper` | `config.py`, `tests/test_config.py` |
| 2 | `feat: add naming_convention to Base.metadata for prefix-aware constraint names` | `db.py` |
| 3 | `feat: use tbl() for __tablename__ and FK strings in all models` | 4 model files |
| 4 | `feat: prefix HANA sequence name via tbl()` | `numbering.py` |
| 5 | `feat: regenerate initial migration with naming_convention and prefixed HANA sequence` | `alembic/versions/` |
| 6 | `docs: add TABLE_PREFIX to .env.example and README` | `.env.example`, `README.md` |
