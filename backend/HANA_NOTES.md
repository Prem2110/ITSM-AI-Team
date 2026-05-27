# HANA Compatibility Notes

This file documents every dialect-specific change made during the HANA compatibility pass. Each entry explains what broke, why, and how it was fixed, along with whether the fix preserves SQLite compatibility.

---

## 1. `app/config.py` — HANA env vars and multi-file loading

**What broke / what was incompatible**: HANA credentials cannot be committed to the repo, but they must be available at startup to build the connection URL. A single `.env` file conflates dev defaults with deployment secrets.

**Why it broke (the dialect difference)**: HANA requires five credentials (`address`, `port`, `user`, `password`, `schema`) plus TLS flags. These cannot be baked into a single `DATABASE_URL` string in the same `.env` file that is checked in as an example.

**How it was fixed**: Added 8 new optional fields to `EnvSettings`: `hana_address`, `hana_port`, `hana_user`, `hana_password`, `hana_schema`, `hana_encrypt` (default `True`), `hana_ssl_validate` (default `False`), `hana_test` (default `False`). Changed `env_file` to load both `.env` and `.env.hana` in that order, so `.env.hana` overrides. `.env.hana` is gitignored.

**Preserves SQLite compat**: Yes. All new fields are optional with defaults. When `.env.hana` is absent, `database_url` defaults to `sqlite+aiosqlite:///./dev.db` and no HANA fields are set, so the HANA code paths are never reached.

---

## 2. `app/db.py` — URL resolution and dialect-aware engine creation

**What broke / what was incompatible**: `hdbcli` (the SAP HANA Python driver) is a synchronous DBAPI. SQLAlchemy's `create_async_engine` requires an async DBAPI and raises an error if given a synchronous one.

**Why it broke (the dialect difference)**: Unlike `aiosqlite` (which is natively async), `hdbcli` has no async variant. There is no `aio-hdbcli` equivalent.

**How it was fixed**: Three functions were added:
- `resolve_database_url()` — checks `VCAP_SERVICES` (SAP BTP production injection) first, then `HANA_*` env vars, then falls back to `DATABASE_URL`. Emits a warning if `VCAP_SERVICES` is present but has partial credentials.
- `_hana_connect_args()` — builds the `hdbcli` connect dict, including `CURRENTSCHEMA` to scope all unqualified table references to the configured schema.
- `_make_engine()` — for HANA URLs, creates a synchronous `hdbcli` engine and wraps it in `sqlalchemy.ext.asyncio.AsyncEngine` (greenlet-based thread dispatch). For all other URLs, uses `create_async_engine` unchanged. HANA engines use `NullPool` to avoid thread-safety issues under greenlet dispatch.

**Preserves SQLite compat**: Yes. The `create_async_engine` + `aiosqlite` path is in an `else` branch and is completely unchanged. The `NullPool` is only applied when a HANA URL is detected.

---

## 3. `alembic/env.py` — HANA-aware migrations

**What broke / what was incompatible**: Two issues:
1. `env_settings.database_url` always returned the SQLite URL, so migrations never ran against HANA.
2. `render_as_batch=True` (required for SQLite `ALTER TABLE` emulation) caused Alembic to generate SQLite-specific table-recreation DDL that is invalid on HANA.

**Why it broke (the dialect difference)**: SQLite does not support `ALTER TABLE ... ADD COLUMN` with constraints or `ALTER TABLE ... DROP COLUMN`, so Alembic uses a batch mode that recreates the whole table. HANA supports `ALTER TABLE` natively; using batch mode generates `CREATE TABLE ... AS SELECT` constructs that HANA rejects.

**How it was fixed**: `config.set_main_option` now calls `resolve_database_url()` instead of reading `env_settings.database_url`. `render_as_batch` is set conditionally — `True` only when the resolved URL starts with `sqlite`. `run_async_migrations` has a HANA branch that constructs `AsyncEngine(sync_engine)` in the same way as `db.py`.

**Preserves SQLite compat**: Yes. `render_as_batch=True` still applies when the URL is a SQLite URL. The HANA branch is unreachable during local SQLite dev.

---

## 4. `pyproject.toml` — added `sqlalchemy-hana`

**What broke / what was incompatible**: Without `sqlalchemy-hana`, SQLAlchemy does not recognise the `hana+hdbcli://` dialect scheme and raises `NoSuchModuleError` when building or executing HANA DDL.

**Why it broke (the dialect difference)**: SQLAlchemy uses entry-point-registered dialect plugins. HANA is not a built-in dialect; it requires the `sqlalchemy-hana` package to register the `hana` dialect and its `hdbcli` driver.

**How it was fixed**: Added `sqlalchemy-hana>=0.5.0` to `[project].dependencies` in `pyproject.toml`.

**Preserves SQLite compat**: Yes. The package is installed but its dialect code is only loaded when SQLAlchemy encounters a `hana+hdbcli://` URL. No SQLite code paths are affected.

---

## 5. `app/types.py` — `JSONText` TypeDecorator

**What broke / what was incompatible**: `event_metadata` columns declared as `sa.JSON` worked correctly on SQLite but returned raw unparsed strings on HANA, breaking callers that accessed `event.event_metadata["from_state"]` (a dict key lookup on a string raises `TypeError`).

**Why it broke (the dialect difference)**: SQLAlchemy maps `sa.JSON` to `NCLOB` on HANA. The `hdbcli` driver may return `NCLOB` content as a raw Python string rather than a parsed object, bypassing SQLAlchemy's JSON deserialization hook. SQLite's `aiosqlite` driver consistently returns the stored string and SQLAlchemy's JSON type deserializes it correctly.

**How it was fixed**: A new `JSONText(TypeDecorator)` was introduced in `app/types.py`. It uses `impl = Text` (plain text column, no dialect-specific mapping). On write, Python dicts/lists are serialized to a JSON string via `json.dumps`. On read, the string is deserialized via `json.loads`. An `isinstance` guard handles the case where the DBAPI driver has already deserialized the value (passthrough).

**Preserves SQLite compat**: Yes. `Text` on SQLite stores the same JSON string. The TypeDecorator's process hooks run symmetrically on both dialects, so application behavior is identical to the original `sa.JSON` usage.

---

## 6. `app/models/incident_event.py` — uses `JSONText`

**What broke / what was incompatible**: The `event_metadata` column used `sa.JSON`, which caused the HANA deserialization issue described in Change 5.

**Why it broke (the dialect difference)**: See Change 5.

**How it was fixed**: The `event_metadata` column type was changed from `sa.JSON` to `JSONText` (imported from `app.types`).

**Preserves SQLite compat**: Yes. See Change 5.

---

## 7. `tests/conftest.py` — HANA test infrastructure

**What broke / what was incompatible**: The standard SQLite test isolation strategy (create tables in a transaction, run the test, roll back the transaction) does not work on HANA because DDL on HANA is auto-committed and cannot be rolled back.

**Why it broke (the dialect difference)**: On SQLite, `CREATE TABLE` inside an open transaction is visible within that transaction and is rolled back with it. On HANA (and most production databases), DDL statements issue an implicit commit, ending the transaction. Rolling back after DDL on HANA has no effect on the tables already created.

**How it was fixed**: When `env_settings.hana_test=True` (set by `HANA_TEST=1`):
1. Tables are created once per test session at session start (via a synchronous `metadata.create_all`).
2. After each test, all tables are truncated (`TRUNCATE TABLE`) — this is DML, not DDL, and achieves per-test isolation without transactions.
3. Tables are dropped once at session end.

When `hana_test=False`, the original SQLite in-memory path is used without modification.

**Preserves SQLite compat**: Yes. The HANA path is in an `if hana_test` branch. The `else` branch is the original SQLite path, unchanged. All 102 tests pass with `HANA_TEST=0` (the default).

---

## HANA sequence

The migration in `alembic/versions/1662b6fded47_initial.py` contains a HANA-only branch that creates the incident number sequence:

```sql
CREATE SEQUENCE {tbl('INC_SEQ')} START WITH 1 INCREMENT BY 1
```

This is guarded by a dialect check (`context.dialect.name == "hana"`) so it is skipped on SQLite. By convention, HANA sequence names are uppercase. `INC_SEQ` is already uppercase in the migration, so no quoting or case-folding issues arise. With `TABLE_PREFIX=ITSM_PREM_`, the sequence is created as `ITSM_PREM_INC_SEQ`.
