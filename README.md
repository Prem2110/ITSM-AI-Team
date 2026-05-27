# ITSM — IT Service Management

A single-tenant IT Service Management tool — a simplified ServiceNow-like ticketing system. Each customer gets their own deployment on SAP BTP Cloud Foundry.

## Tech Stack

- **Backend:** Python 3.11+, FastAPI, SQLAlchemy 2.0 (async), Alembic
- **Database:** SAP HANA (production) / SQLite (local dev)
- **Frontend:** React 18, Vite, TypeScript, Tailwind CSS
- **Auth:** SAP XSUAA (production) / fake-auth stub (local dev)
- **Deployment:** SAP BTP Cloud Foundry

## Prerequisites

- Python 3.11+
- Node.js 18+
- [uv](https://docs.astral.sh/uv/) (Python package manager)

## Running Locally

### Backend

```bash
cd backend
cp .env.example .env          # edit AUTH_MODE and DATABASE_URL if needed
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

The API is now available at http://localhost:8000. Health check: http://localhost:8000/health

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The UI is now available at http://localhost:5173. API requests to `/api/*` are proxied to the backend.

## Running against HANA

### Setup

1. Create `backend/.env.hana` (gitignored):
   ```
   HANA_ADDRESS=<your-host>.hana.cloud.sap
   HANA_PORT=443
   HANA_USER=<user>
   HANA_PASSWORD=<password>
   HANA_SCHEMA=<schema>
   HANA_ENCRYPT=true
   HANA_SSL_VALIDATE=false
   TABLE_PREFIX=ITSM_PREM_  # or any unique prefix for your deployment
   ```

2. Install `hdbcli` (SAP HANA Python driver — requires SAP credentials):
   ```bash
   cd backend
   uv add hdbcli
   ```
   `sqlalchemy-hana` is already in `pyproject.toml` and installed by `uv sync`.

3. Check for table-name collisions in the shared schema:
   ```bash
   cd backend
   uv run python scripts/inspect_hana.py
   ```
   If no collisions are reported, proceed.

### Running migrations against HANA

```bash
cd backend
uv run alembic upgrade head
```

The URL resolver detects `HANA_ADDRESS` in `.env.hana` and routes to HANA automatically.

### Running tests against HANA

```bash
cd backend
HANA_TEST=1 uv run pytest -v
```

This:
- Creates `ITSM_TEST_*` tables in the HANA schema at session start
- Runs all 102 tests against the real HANA engine
- Truncates tables between tests for isolation
- Drops `ITSM_TEST_*` tables at session end

Expected: 102 tests pass. Any failures indicate a HANA dialect issue — see `backend/HANA_NOTES.md`.

### Expected output (migration)

```
INFO  [alembic.runtime.migration] Running upgrade  -> 1662b6fded47, initial
```

Tables created: `ITSM_PREM_users`, `ITSM_PREM_incidents`, `ITSM_PREM_incident_events`, `ITSM_PREM_attachments`
Sequence created: `ITSM_PREM_INC_SEQ`

---

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

Tests always run with `TABLE_PREFIX=""` (the default). Ensure `backend/.env` does not set `TABLE_PREFIX` to a non-empty value — pydantic-settings reads `.env` at import time, and a non-empty prefix in `.env` will cause all tests to fail with "no such table" errors.

## Configuration

Edit `backend/config.yaml` to customise per-customer settings:

- **priorities** — names, colours, and SLA hours (Critical / High / Medium / Low)
- **categories** — incident categories for your organisation
- **states** and **state_transitions** — the incident state machine
- **company_name** and **number_prefix** — branding

## Auth Modes

| Mode | Usage |
|------|-------|
| `AUTH_MODE=fake` | Local development — skips JWT validation, uses a hardcoded caller identity |
| `AUTH_MODE=real` | Production on SAP BTP — validates XSUAA JWTs; requires XSUAA_* env vars |

Set `AUTH_MODE` in `backend/.env` (copy from `backend/.env.example`).

## Project Structure

```
backend/          FastAPI app + SQLAlchemy models + business logic
frontend/         React + Vite + TypeScript UI
deploy/           SAP BTP deployment scripts (coming soon)
```
