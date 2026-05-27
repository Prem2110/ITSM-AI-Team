# ITSM — IT Service Management

> **New here?** Read the [Client Onboarding Guide](CLIENTONBOARDING.md) for step-by-step setup, database table reference, table prefix guide, and troubleshooting.

A single-tenant IT Service Management tool — a simplified ServiceNow-like ticketing system. Each customer gets their own deployment on SAP BTP Cloud Foundry.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend API | Python 3.11+, FastAPI, SQLAlchemy 2.0 (async), Alembic |
| Database | SAP HANA (production) / SQLite (local dev) |
| Frontend | React 18, Vite, TypeScript, Tailwind CSS, React Query |
| Charts | Recharts |
| Auth | SAP XSUAA (production) / fake-auth stub (local dev) |
| Deployment | SAP BTP Cloud Foundry |

---

## Prerequisites

- Python 3.11+
- Node.js 18+
- [uv](https://docs.astral.sh/uv/) — `pip install uv`

---

## Quick Start (Local Dev)

### 1. Backend

```bash
cd backend
cp .env.example .env          # edit DATABASE_URL / AUTH_MODE if needed
uv sync
uv run alembic upgrade head   # creates dev.db
uv run python scripts/seed_dev.py   # optional: load sample data
uv run uvicorn app.main:app --reload --port 8000
```

- API: `http://localhost:8000`
- Swagger docs: `http://localhost:8000/docs`
- Health check: `http://localhost:8000/health`

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

- UI: `http://localhost:5173`
- All `/api/*` requests are proxied to the backend.

### 3. First login

Open `http://localhost:5173`. The app redirects to `/setup` on a fresh database. Complete the wizard (company name + timezone), then log in with any email from the seeded users:

| Email | Role |
|-------|------|
| `admin@acme.com` | Admin |
| `sarah.chen@acme.com` | Agent |
| `james.park@acme.com` | Requester |

---

## Project Structure

```
ITSM/
├── backend/
│   ├── app/
│   │   ├── auth/           Fake dev auth + SAP XSUAA JWT validation
│   │   ├── models/         SQLAlchemy ORM models (users, incidents, events, attachments, app_settings)
│   │   ├── repositories/   SQL data access (one file per model)
│   │   ├── services/       Business logic (IncidentService, numbering)
│   │   ├── routers/        FastAPI route handlers
│   │   ├── schemas/        Pydantic request/response models
│   │   ├── config.py       Config loader (YAML + env)
│   │   ├── db.py           Async SQLAlchemy engine + session
│   │   ├── main.py         FastAPI app, middleware, router registration
│   │   └── state_machine.py  Transition validator
│   ├── alembic/            Migration scripts
│   ├── scripts/            seed_dev.py, inspect_hana.py, cleanup_hana.py
│   ├── config.yaml         Per-customer settings (priorities, categories, states)
│   └── .env.example        Environment variable template
└── frontend/
    └── src/
        ├── api/            Axios client + per-domain fetch helpers
        ├── components/     Layout, badges, skeletons, route guards, toolbar
        ├── contexts/       SettingsContext (theme, font size, dark mode)
        ├── hooks/          React Query hooks (useIncidents, useMe, useDashboard, …)
        ├── pages/          Login, Setup, Dashboard, Incidents, IncidentDetail, Settings
        └── types/          TypeScript interfaces
```

---

## Architecture

### Backend layers

```
HTTP request
  → router       (auth check via require_scope(), serialisation)
  → service      (business logic: create, transition, SLA calculation)
  → repository   (async SQLAlchemy queries)
  → model        (ORM class, maps to DB table)
```

### Configuration — two layers

| File | Contents | When loaded |
|------|----------|------------|
| `backend/config.yaml` | Per-customer settings: company name, number prefix, priorities (with SLA hours), categories, states, state_transitions | Once at import time → `app_config` |
| `backend/.env` | Runtime env: `DATABASE_URL`, `AUTH_MODE`, XSUAA vars, `CORS_ORIGINS`, `TABLE_PREFIX` | Pydantic Settings → `env_settings` |

### State machine

Incident state transitions are driven entirely by `config.yaml → state_transitions`. The `state_machine.validate_transition(from, to, payload)` function raises `ValueError` for:
- Any transition not listed in the config map.
- A transition to `resolved` without both `resolution_code` and `resolution_notes`.

### SLA tracking

When an incident is created, `sla_resolution_due` is calculated as `now + priority.sla_hours`. A background check or per-request flag sets `sla_breached = true` if the deadline has passed and the incident is not yet resolved.

---

## API Endpoints

| Method | Path | Auth scope | Description |
|--------|------|-----------|-------------|
| GET | `/health` | None | Health check |
| GET | `/api/session` | TicketRead | Current user info |
| GET | `/api/config` | TicketRead | Priorities, categories, states from config.yaml |
| POST | `/api/setup` | None | Complete setup wizard (creates app_settings row) |
| GET | `/api/incidents` | TicketRead | List incidents (filterable, paginated) |
| POST | `/api/incidents` | TicketWrite | Create new incident |
| GET | `/api/incidents/{id}` | TicketRead | Get single incident |
| PATCH | `/api/incidents/{id}` | TicketWrite | Update incident fields |
| POST | `/api/incidents/{id}/transition` | Agent | Transition incident state |
| GET | `/api/incidents/{id}/events` | TicketRead | Get audit trail events |
| POST | `/api/incidents/{id}/events` | TicketWrite | Add comment / work note |
| GET | `/api/users` | Agent | List all users (for assignment dropdown) |
| GET | `/api/dashboard` | TicketRead | Stats, charts, SLA compliance data |
| POST | `/api/attachments` | TicketWrite | Upload file attachment |
| GET | `/api/attachments/{id}` | TicketRead | Download attachment |

---

## Frontend Routes

| Path | Page | Description |
|------|------|-------------|
| `/setup` | Setup wizard | First-time configuration |
| `/login` | Login | Fake-auth email picker |
| `/incidents` | Incident list | Filterable, paginated table |
| `/incidents/new` | New incident form | Create a ticket |
| `/incidents/:id` | Incident detail | View, edit, transition, comment |
| `/dashboard` | Dashboard | Stats cards + charts |
| `/settings` | App settings | Manage users, resolution codes |
| `/settings/appearance` | Appearance | Theme, font, density |

---

## Database Tables

See [CLIENTONBOARDING.md — Section 6](CLIENTONBOARDING.md#6-database-tables--schema-reference) for full column-level documentation.

| Table | Purpose |
|-------|---------|
| `users` | All users (admin / agent / requester) |
| `incidents` | Tickets — one row per incident |
| `incident_events` | Append-only audit trail (comments, state changes, work notes) |
| `attachments` | File attachment metadata and blob references |
| `app_settings` | Singleton row set by the setup wizard |

HANA deployments also create a sequence `INC_SEQ` (or `{PREFIX}INC_SEQ`) for ticket numbering.

---

## Table Prefix

The `TABLE_PREFIX` environment variable prepends a string to every table name. Used when multiple ITSM deployments share a single HANA schema.

| Scenario | `TABLE_PREFIX` | Tables |
|----------|----------------|--------|
| Production (dedicated HDI container) | *(empty)* | `users`, `incidents`, … |
| Shared dev — personal | `ITSM_PREM_` | `ITSM_PREM_users`, … |
| Shared dev — team QA | `ITSM_QA_` | `ITSM_QA_users`, … |

See [CLIENTONBOARDING.md — Section 7](CLIENTONBOARDING.md#7-table-prefix-multi-tenant-deployments) for changing the prefix.

---

## Configuration Reference (`backend/config.yaml`)

```yaml
company_name: "Acme Corporation"
number_prefix: "INC"              # ticket numbers: INC-001, INC-002, …

priorities:                       # ordered 1 (highest) → 4 (lowest)
  - name: Critical  color: red     sla_hours: 4
  - name: High      color: orange  sla_hours: 8
  - name: Medium    color: yellow  sla_hours: 24
  - name: Low       color: green   sla_hours: 72

categories:
  - Network
  - Hardware
  - Software
  - Account Access
  - SAP Integration

states:
  - new | assigned | in_progress | on_hold | resolved | closed

state_transitions:
  new: [assigned]
  assigned: [in_progress, on_hold, new]
  in_progress: [on_hold, resolved, assigned]
  on_hold: [in_progress, assigned]
  resolved: [closed, in_progress]
  closed: []
```

---

## Auth Modes

| `AUTH_MODE` | Usage | How it works |
|-------------|-------|-------------|
| `fake` | Local dev / QA | Frontend sends `X-Fake-User: <email>` header; backend looks up user by email and derives scopes from role |
| `real` | SAP BTP production | Backend validates SAP XSUAA JWT; scopes come from token claims |

---

## Running against SAP HANA

See [CLIENTONBOARDING.md — Section 8](CLIENTONBOARDING.md#8-sap-hana-production-setup) for full setup steps.

```bash
cd backend
# create backend/.env.hana with HANA_ADDRESS, PORT, USER, PASSWORD, SCHEMA
uv run python scripts/inspect_hana.py   # check for table collisions
uv run alembic upgrade head             # create tables
```

---

## Running Tests

```bash
cd backend
uv run pytest                          # all tests (SQLite in-memory)
uv run pytest tests/test_incidents.py -v   # single file
HANA_TEST=1 uv run pytest -v           # against real HANA
```

```bash
cd frontend
npx tsc --noEmit                       # TypeScript type-check
```

---

## Useful Commands

```bash
# Backend
uv run alembic upgrade head                          # apply migrations
uv run alembic revision --autogenerate -m "change"   # generate migration
uv run python scripts/seed_dev.py                    # load sample data
uv run python scripts/inspect_hana.py                # HANA collision check
uv run python scripts/cleanup_hana.py                # HANA table cleanup

# Frontend
npm run dev        # dev server
npm run build      # production build
npx tsc --noEmit   # type-check
```
