# Table Prefix Support — Design Spec

**Date:** 2026-05-27  
**Status:** Approved

## Problem

The ITSM backend shares a single SAP HANA schema with other workloads in the dev environment. Table names (`users`, `incidents`, `incident_events`, `attachments`) are generic and will collide with other projects. In production, customers get dedicated HDI Containers and no prefix is needed — so the prefix must be zero-cost when empty.

---

## Approach: `tbl()` helper in `config.py`

A single helper `tbl(name: str) -> str` in `app/config.py` prefixes any table or object name. All models, FK strings, explicit index names, the HANA sequence name, and the migration call `tbl()` at definition/execution time. The helper is a pure string concat — no indirection, no magic.

```
tbl("users")          # TABLE_PREFIX=""        → "users"
tbl("users")          # TABLE_PREFIX="ITSM_DEV_" → "ITSM_DEV_users"
```

---

## Changes

### 1. `app/config.py`

Add `table_prefix` field to `EnvSettings`:

```python
table_prefix: str = ""
```

After the `env_settings` singleton, add:

```python
def tbl(name: str) -> str:
    """Prefix a table/object name with TABLE_PREFIX (empty string = no-op)."""
    return env_settings.table_prefix + name
```

`tbl` is the only new public symbol. Models import `tbl` from `app.config`.

---

### 2. `app/db.py` — MetaData naming convention

Add a `MetaData` with `naming_convention` to `Base`. Because `%(table_name)s` expands to the already-prefixed table name, all auto-generated constraint and index names carry the prefix automatically.

```python
from sqlalchemy import MetaData

_convention = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}

class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=_convention)
```

With `TABLE_PREFIX="ITSM_DEV_"`:
- Table → `ITSM_DEV_users`
- Email index → `ix_ITSM_DEV_users_email`
- FK constraint → `fk_ITSM_DEV_incidents_requester_id_ITSM_DEV_users`

---

### 3. Models (4 files)

Each model imports `tbl` and uses it for `__tablename__` and every FK string.

Models use relative imports (consistent with existing `from ..db import Base` pattern). Migration uses absolute imports (consistent with existing `from app.config import env_settings`).

**`app/models/user.py`**
```python
from ..config import tbl            # added

class User(Base):
    __tablename__ = tbl("users")    # was: "users"
    # columns unchanged
```

**`app/models/incident.py`**
```python
from ..config import tbl            # added

class Incident(Base):
    __tablename__ = tbl("incidents")                              # was: "incidents"
    requester_id = mapped_column(..., ForeignKey(tbl("users") + ".id"), ...)
    assignee_id  = mapped_column(..., ForeignKey(tbl("users") + ".id"), ...)
    # relationships use string form "User", "IncidentEvent", "Attachment" — unchanged
```

**`app/models/incident_event.py`**
```python
from ..config import tbl            # added

class IncidentEvent(Base):
    __tablename__ = tbl("incident_events")                        # was: "incident_events"
    __table_args__ = (
        Index(
            f"ix_{tbl('incident_events')}_incident_created",     # was hardcoded name
            "incident_id", "created_at"
        ),
    )
    incident_id = mapped_column(..., ForeignKey(tbl("incidents") + ".id"), ...)
    actor_id    = mapped_column(..., ForeignKey(tbl("users") + ".id"), ...)
```

**`app/models/attachment.py`**
```python
from ..config import tbl            # added

class Attachment(Base):
    __tablename__ = tbl("attachments")                            # was: "attachments"
    incident_id = mapped_column(..., ForeignKey(tbl("incidents") + ".id"), ...)
    uploaded_by = mapped_column(..., ForeignKey(tbl("users") + ".id"), ...)
```

---

### 4. `app/services/numbering.py` — HANA sequence

The sequence base name changes from `ITSM_INC_SEQ` to `INC_SEQ`, prefixed via `tbl()`:

```python
from ..config import tbl

# HANA branch:
result = await session.execute(text(f"SELECT {tbl('INC_SEQ')}.NEXTVAL FROM DUMMY"))
```

With `TABLE_PREFIX=""` → sequence `INC_SEQ`  
With `TABLE_PREFIX="ITSM_DEV_"` → sequence `ITSM_DEV_INC_SEQ`

---

### 5. `alembic/versions/655a7884ea67_initial.py` — delete and regenerate

The existing migration has hardcoded table names. It is deleted; a new initial migration is generated after each step:

```bash
# Empty prefix — tables: users, incidents, …
TABLE_PREFIX="" uv run alembic revision --autogenerate -m "initial"

# ITSM_DEV_ prefix — tables: ITSM_DEV_users, ITSM_DEV_incidents, …
TABLE_PREFIX="ITSM_DEV_" uv run alembic revision --autogenerate -m "initial"
```

The HANA sequence block in the migration uses `tbl()`:

```python
from app.config import tbl

# in upgrade():
if bind.dialect.name == "hana":
    op.execute(f"CREATE SEQUENCE {tbl('INC_SEQ')} START WITH 1 INCREMENT BY 1")

# in downgrade():
if bind.dialect.name == "hana":
    op.execute(f"DROP SEQUENCE IF EXISTS {tbl('INC_SEQ')}")
```

Note: Alembic autogenerate does not generate the HANA sequence block — it is added manually post-generation, as it is today. The migration file is not fully auto-generated; it is auto-generated then patched.

> **HANA case-folding follow-up (non-blocker):** HANA folds unquoted identifiers to uppercase. `INC_SEQ` is already uppercase, so `CREATE SEQUENCE INC_SEQ` and `SELECT INC_SEQ.NEXTVAL` work without quoting. But once a prefix is applied — e.g. `ITSM_DEV_INC_SEQ` — consistency with table names (which are lowercase, e.g. `ITSM_DEV_users`) becomes a concern. Verify during HANA compatibility work whether the sequence DDL and the `SELECT ... NEXTVAL` query need explicit quoting to match the case of the name as stored. If there is any risk, standardize all identifiers to either all-uppercase with unquoted references, or all-lowercase with double-quoted references — and apply that consistently across both sequence and table DDL. This is a follow-up for the HANA prompt, not a blocker for the prefix work on SQLite.

---

### 6. `alembic/env.py`

No changes required. `env.py` already imports `env_settings` (to get `DATABASE_URL`) and imports `app.models` (which causes all models to register with `Base.metadata`). When alembic runs with `TABLE_PREFIX=ITSM_DEV_`, `Base.metadata` already contains the prefixed table names. Autogenerate just works.

---

### 7. `.env.example`

Add after `DATABASE_URL`:

```
# Table name prefix — use to avoid collisions in a shared schema (e.g. dev HANA HDI Container)
# Examples: TABLE_PREFIX=ITSM_DEV_   TABLE_PREFIX=ITSM_PREM_   TABLE_PREFIX=
# Production deployments with a dedicated HDI Container: leave empty (no prefix).
TABLE_PREFIX=
```

---

### 8. Tests

No test changes needed. `TABLE_PREFIX` defaults to `""` when unset, so `tbl("users")` → `"users"` and all tests continue to work against in-memory SQLite with unprefixed table names. 

Requirement: `TABLE_PREFIX` must not be set in the test environment. If a `.env` file in `backend/` sets a non-empty prefix, tests will pick it up via pydantic-settings. Document that `backend/.env` must not set `TABLE_PREFIX` for tests.

---

### 9. README.md — new section

A new section "Changing the table prefix" documents:
- What `TABLE_PREFIX` does
- How to change it for a new deployment (drop DB / schema objects, update `TABLE_PREFIX`, regenerate migration, apply)
- That prefix changes are not supported on running deployments
- That `backend/.env` must have `TABLE_PREFIX=` (empty) for local dev tests to pass

---

## Verification Steps

1. Show diff in models — each `__tablename__` and FK string uses `tbl()`
2. Show `config.py` — `table_prefix` field + `tbl()` helper
3. Confirm `alembic/env.py` — no change needed
4. **Empty prefix run:** Drop `dev.db`, delete migration, regenerate with `TABLE_PREFIX=""`, apply. Run `sqlite3 dev.db .schema` — confirm tables are `users`, `incidents`, `incident_events`, `attachments`; confirm index names are `ix_users_email`, `ix_incidents_number`, `ix_incident_events_incident_created`, etc.
5. **Prefixed run:** Drop `dev.db`, delete migration, regenerate with `TABLE_PREFIX="ITSM_TEST_"`, apply. Run `sqlite3 dev.db .schema` — confirm every identifier carries the prefix: `ITSM_TEST_users`, `ITSM_TEST_incidents`, `ix_ITSM_TEST_users_email`, `fk_ITSM_TEST_incidents_requester_id_ITSM_TEST_users`, etc. Show both `.schema` outputs side-by-side as proof.
6. **Test suite:** Reset to `TABLE_PREFIX=""`, run `uv run pytest` — all 87 tests pass.
7. **Seed script:** Run seed with `TABLE_PREFIX="ITSM_TEST_"` — confirm it completes without error and data lands in prefixed tables.
8. Show updated `.env.example`

---

## What this does NOT do

- No runtime prefix switching — set once at startup from env var
- No UI or admin surface for the prefix
- No "rename tables" migration — prefix changes require a fresh deployment
- Alembic stays in place; migration history is per-prefix
