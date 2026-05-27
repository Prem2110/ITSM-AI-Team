# ITSM Client Onboarding Guide

Step-by-step setup guide for new customers and team members deploying the ITSM tool on SAP BTP or locally.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Clone & Folder Layout](#2-clone--folder-layout)
3. [Local Development Setup](#3-local-development-setup)
4. [First-Time Setup Wizard](#4-first-time-setup-wizard)
5. [Customise Per-Customer Settings](#5-customise-per-customer-settings)
6. [Database Tables & Schema Reference](#6-database-tables--schema-reference)
7. [Table Prefix (Multi-Tenant Deployments)](#7-table-prefix-multi-tenant-deployments)
8. [SAP HANA Production Setup](#8-sap-hana-production-setup)
9. [Authentication Modes](#9-authentication-modes)
10. [Users, Roles & Scopes](#10-users-roles--scopes)
11. [Seed Development Data](#11-seed-development-data)
12. [Running Tests](#12-running-tests)
13. [SAP BTP Deployment](#13-sap-btp-deployment)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Python | 3.11+ | python.org |
| Node.js | 18+ | nodejs.org |
| uv | latest | `pip install uv` or `curl -Lsf https://astral.sh/uv/install.sh \| sh` |
| git | any | git-scm.com |

Verify:
```bash
python --version   # 3.11+
node --version     # 18+
uv --version       # any
```

---

## 2. Clone & Folder Layout

```
ITSM/
├── backend/            FastAPI + SQLAlchemy async API
│   ├── app/            Application source code
│   │   ├── auth/       Auth modules (fake dev + XSUAA production)
│   │   ├── models/     SQLAlchemy ORM models
│   │   ├── repositories/   SQL data access layer
│   │   ├── routers/    HTTP route handlers
│   │   ├── services/   Business logic
│   │   ├── schemas/    Pydantic request/response models
│   │   ├── config.py   Config loader (YAML + env)
│   │   ├── db.py       Database engine & session
│   │   ├── main.py     FastAPI app definition
│   │   └── state_machine.py  Incident state transition validator
│   ├── alembic/        Database migration scripts
│   ├── scripts/        Utility scripts (seed, HANA inspect/cleanup)
│   ├── config.yaml     Per-customer settings (committed)
│   ├── .env.example    Environment variable template
│   └── pyproject.toml  Python dependencies
├── frontend/           React + Vite + TypeScript UI
│   ├── src/
│   │   ├── api/        Axios API client + per-domain fetch helpers
│   │   ├── components/ Reusable UI components
│   │   ├── contexts/   React context (SettingsContext)
│   │   ├── hooks/      React Query data hooks
│   │   ├── pages/      Route-level page components
│   │   └── types/      TypeScript interfaces
│   ├── package.json
│   └── vite.config.ts
├── deploy/             SAP BTP deployment artefacts (manifest, xs-security)
├── docs/               Project documentation and plans
├── CLAUDE.md           Developer guidance for Claude Code
├── CLIENTONBOARDING.md This file
└── README.md           Project overview
```

---

## 3. Local Development Setup

### 3a. Backend

```bash
cd backend

# Copy the example environment file and edit as needed
cp .env.example .env

# Install Python dependencies
uv sync

# Apply database migrations (creates dev.db in backend/)
uv run alembic upgrade head

# Start the API server (http://localhost:8000)
uv run uvicorn app.main:app --reload --port 8000
```

Verify the backend is running:
- Health check: `http://localhost:8000/health`
- API docs: `http://localhost:8000/docs`

Default `.env` values (SQLite, fake auth — fine for local dev):
```
DATABASE_URL=sqlite+aiosqlite:///./dev.db
AUTH_MODE=fake
```

### 3b. Frontend

```bash
cd frontend

npm install
npm run dev
```

The UI is available at `http://localhost:5173`. All `/api/*` requests are proxied to the backend at `localhost:8000`.

### 3c. Type-check frontend

```bash
cd frontend
npx tsc --noEmit
```

---

## 4. First-Time Setup Wizard

On first load, the app redirects to `/setup`. This wizard:

1. Stores your **company name** and **timezone** in the `app_settings` table (singleton row with `id = "singleton"`).
2. Marks setup as complete by setting `setup_completed_at`.
3. Once complete, the app routes normally to `/login` and then the dashboard.

If you need to re-run the wizard (e.g. fresh database):
```bash
cd backend
# Delete dev.db and re-migrate
rm dev.db
uv run alembic upgrade head
```

---

## 5. Customise Per-Customer Settings

All customer-specific settings live in `backend/config.yaml`. Edit this file before running migrations for a new customer deployment.

```yaml
# Company branding
company_name: "Acme Corporation"

# Ticket number prefix — tickets will be numbered INC-001, INC-002, …
number_prefix: "INC"

# Priority levels (ordered highest → lowest)
# Each priority has an SLA in hours — the breach deadline is set at ticket creation
priorities:
  - name: Critical
    color: red
    sla_hours: 4          # 4 hours to resolve
  - name: High
    color: orange
    sla_hours: 8
  - name: Medium
    color: yellow
    sla_hours: 24         # 1 business day
  - name: Low
    color: green
    sla_hours: 72         # 3 days

# Incident categories shown in the New Incident form
categories:
  - Network
  - Hardware
  - Software
  - Account Access
  - SAP Integration

# All valid states
states:
  - new
  - assigned
  - in_progress
  - on_hold
  - resolved
  - closed

# Allowed transitions: key = from_state, values = list of valid to_states
# Transitions not listed here are rejected by the state machine
state_transitions:
  new:
    - assigned
  assigned:
    - in_progress
    - on_hold
    - new
  in_progress:
    - on_hold
    - resolved
    - assigned
  on_hold:
    - in_progress
    - assigned
  resolved:
    - closed
    - in_progress
  closed: []              # terminal state — no outbound transitions
```

### Priority numbering

Priorities are stored as integers (1-based index into the `priorities` list):

| Priority name | Stored value | SLA |
|---------------|-------------|-----|
| Critical      | 1           | 4 h |
| High          | 2           | 8 h |
| Medium        | 3           | 24 h |
| Low           | 4           | 72 h |

### Resolving an incident

Transitioning to `resolved` requires two extra fields:
- `resolution_code` — short code (e.g. `hardware_replaced`, `configuration_change`)
- `resolution_notes` — free-text description of the fix

These are enforced by `state_machine.validate_transition()`.

---

## 6. Database Tables & Schema Reference

All tables are created by Alembic migrations in `backend/alembic/versions/`. With no `TABLE_PREFIX`, tables are named as below. With a prefix (e.g. `ITSM_PREM_`) they become `ITSM_PREM_users`, etc. See [Section 7](#7-table-prefix-multi-tenant-deployments).

---

### Table: `users`

Stores all users (admins, agents, requesters).

| Column | Type | Notes |
|--------|------|-------|
| `id` | VARCHAR(36) PK | UUID |
| `email` | VARCHAR(255) UNIQUE | User email — used as login identity |
| `name` | VARCHAR(255) | Display name |
| `role` | VARCHAR(50) | `admin` \| `agent` \| `requester` |
| `active` | BOOLEAN | Soft-disable users without deleting |
| `created_at` | DATETIME TZ | Row creation timestamp |
| `updated_at` | DATETIME TZ | Last modification timestamp |

---

### Table: `incidents`

The main ticket table. One row per incident.

| Column | Type | Notes |
|--------|------|-------|
| `id` | VARCHAR(36) PK | UUID |
| `number` | VARCHAR(20) UNIQUE | Human-readable ID: `INC-001`, `INC-002`, … |
| `title` | VARCHAR(500) | Short summary |
| `description` | TEXT | Full description |
| `state` | VARCHAR(50) | `new` \| `assigned` \| `in_progress` \| `on_hold` \| `resolved` \| `closed` |
| `priority` | INTEGER | 1 = Critical, 2 = High, 3 = Medium, 4 = Low |
| `category` | VARCHAR(100) | Matches a value from `config.yaml → categories` |
| `source` | VARCHAR(50) | `web` \| `email` \| `phone` \| … |
| `requester_id` | VARCHAR(36) FK → `users.id` | Who submitted the ticket |
| `assignee_id` | VARCHAR(36) FK → `users.id` NULLABLE | Assigned agent (NULL if unassigned) |
| `resolution_code` | VARCHAR(100) NULLABLE | Required when transitioning to `resolved` |
| `resolution_notes` | TEXT NULLABLE | Required when transitioning to `resolved` |
| `sla_resolution_due` | DATETIME TZ NULLABLE | SLA deadline (set at creation from priority SLA hours) |
| `sla_breached` | BOOLEAN | `true` if current time > `sla_resolution_due` and not resolved |
| `created_at` | DATETIME TZ | |
| `updated_at` | DATETIME TZ | |
| `resolved_at` | DATETIME TZ NULLABLE | Set when state transitions to `resolved` |
| `closed_at` | DATETIME TZ NULLABLE | Set when state transitions to `closed` |

**Relationships (all `lazy="raise"` — must be explicitly loaded):**
- `assignee` → `User`
- `events` → list of `IncidentEvent`
- `attachments` → list of `Attachment`

---

### Table: `incident_events`

Append-only audit trail. One row per action on a ticket.

| Column | Type | Notes |
|--------|------|-------|
| `id` | VARCHAR(36) PK | UUID |
| `incident_id` | VARCHAR(36) FK → `incidents.id` | Parent ticket |
| `actor_id` | VARCHAR(36) FK → `users.id` | Who performed the action |
| `event_type` | VARCHAR(50) | `comment` \| `state_change` \| `work_note` \| … |
| `body` | TEXT NULLABLE | Comment or note text |
| `metadata` | JSON NULLABLE | Structured data (see below) |
| `created_at` | DATETIME TZ | Event timestamp |

**`metadata` shapes by event type:**

| `event_type` | `metadata` shape |
|-------------|-----------------|
| `state_change` | `{ "from_state": "new", "to_state": "assigned" }` |
| `comment` | `null` (text is in `body`) |
| `work_note` | `null` (text is in `body`) |

**Composite index:** `(incident_id, created_at)` for fast event timeline queries.

---

### Table: `attachments`

File attachments linked to incidents.

| Column | Type | Notes |
|--------|------|-------|
| `id` | VARCHAR(36) PK | UUID |
| `incident_id` | VARCHAR(36) FK → `incidents.id` INDEX | Parent ticket |
| `filename` | VARCHAR(500) | Original file name |
| `mime_type` | VARCHAR(100) | e.g. `image/png`, `application/pdf` |
| `size_bytes` | INTEGER | File size |
| `blob_ref` | VARCHAR(1000) | Storage path or S3-style key |
| `uploaded_by` | VARCHAR(36) FK → `users.id` INDEX | Who uploaded the file |
| `uploaded_at` | DATETIME TZ | Upload timestamp |

---

### Table: `app_settings`

Singleton row (always `id = "singleton"`) — set by the setup wizard.

| Column | Type | Notes |
|--------|------|-------|
| `id` | VARCHAR(16) PK | Always `"singleton"` |
| `company_name` | VARCHAR(255) | Set in setup wizard |
| `timezone` | VARCHAR(100) | IANA timezone, e.g. `America/New_York` |
| `sla_targets` | JSON NULLABLE | Optional SLA override map |
| `resolution_codes` | JSON NULLABLE | List of valid resolution code strings |
| `setup_completed_at` | DATETIME TZ | When wizard finished |
| `setup_completed_by` | VARCHAR(36) NULLABLE | User ID who completed setup |
| `created_at` | DATETIME TZ | |
| `updated_at` | DATETIME TZ | |

---

### HANA Sequence: `INC_SEQ` (or `{PREFIX}INC_SEQ`)

Used on SAP HANA to generate incrementing ticket numbers (e.g. `INC-001`). Created by the initial migration. SQLite uses a different strategy (max+1 query) and does not need a sequence.

---

## 7. Table Prefix (Multi-Tenant Deployments)

Set `TABLE_PREFIX` in your `.env` to add a string prefix to every table name, index, constraint, and HANA sequence. This prevents name collisions when multiple ITSM deployments share a single HANA schema.

| Scenario | `TABLE_PREFIX` | Tables created |
|----------|----------------|----------------|
| Production — dedicated HDI container | *(empty)* | `users`, `incidents`, … |
| Shared dev schema — personal sandbox | `ITSM_PREM_` | `ITSM_PREM_users`, `ITSM_PREM_incidents`, … |
| Shared dev schema — team QA environment | `ITSM_QA_` | `ITSM_QA_users`, `ITSM_QA_incidents`, … |

The prefix is baked into the Alembic migration at generation time. To use a new prefix on a fresh schema:

```bash
cd backend
# 1. Set the prefix in .env
echo 'TABLE_PREFIX=ITSM_PREM_' >> .env

# 2. Drop all existing tables / use a fresh schema

# 3. Delete old migrations
rm backend/alembic/versions/*.py

# 4. Regenerate migrations
uv run alembic revision --autogenerate -m "initial"

# 5. Apply
uv run alembic upgrade head
```

> **Important:** Never change `TABLE_PREFIX` on a running deployment. The old tables will be orphaned and new empty ones created.

> **Tests:** Always run with `TABLE_PREFIX=""`. Do not set a non-empty prefix in `backend/.env` — it will break all tests with "no such table" errors.

---

## 8. SAP HANA Production Setup

### 8a. Create `.env.hana`

```bash
# backend/.env.hana  (gitignored)
HANA_ADDRESS=your-instance.hana.cloud.sap
HANA_PORT=443
HANA_USER=your_hdi_rt_user
HANA_PASSWORD=your_password
HANA_SCHEMA=YOUR_HDI_SCHEMA
HANA_ENCRYPT=true
HANA_SSL_VALIDATE=false
TABLE_PREFIX=ITSM_PREM_      # or leave empty for dedicated HDI container
AUTH_MODE=fake                # change to "real" for XSUAA production auth
```

### 8b. Install HANA Python driver

`hdbcli` requires SAP credentials to download:

```bash
cd backend
uv add hdbcli
```

`sqlalchemy-hana` is already in `pyproject.toml`.

### 8c. Check for table-name collisions

```bash
cd backend
uv run python scripts/inspect_hana.py
```

Reports any tables in the shared HANA schema that match the names you are about to create. Resolve collisions by choosing a different `TABLE_PREFIX`.

### 8d. Run migrations against HANA

```bash
cd backend
uv run alembic upgrade head
```

Expected output:
```
INFO  [alembic.runtime.migration] Running upgrade  -> 1662b6fded47, initial
INFO  [alembic.runtime.migration] Running upgrade 1662b6fded47 -> 683feaeb59b7, add app_settings
```

Tables created (with `TABLE_PREFIX=ITSM_PREM_`):
```
ITSM_PREM_users
ITSM_PREM_incidents
ITSM_PREM_incident_events
ITSM_PREM_attachments
ITSM_PREM_app_settings
```

Sequence created:
```
ITSM_PREM_INC_SEQ
```

### 8e. Clean up HANA tables (if needed)

```bash
cd backend
uv run python scripts/cleanup_hana.py
```

Drops all tables and the sequence matching your `TABLE_PREFIX`.

---

## 9. Authentication Modes

### `AUTH_MODE=fake` (local development)

- No JWT validation.
- The frontend reads a user email from `localStorage` (set on the Login page) and attaches it as an `X-Fake-User: <email>` HTTP header on every API request.
- The backend looks up that email in the `users` table and derives scopes from the user's role.
- Suitable for local dev and QA. **Never use in production.**

### `AUTH_MODE=real` (SAP BTP production)

- Validates SAP XSUAA JWTs on every request.
- Requires the following additional env vars:

```
XSUAA_URL=https://your-subaccount.authentication.eu10.hana.ondemand.com
XSUAA_CLIENT_ID=sb-itsm-your-app!t1234
XSUAA_CLIENT_SECRET=your-secret
XSUAA_XSAPPNAME=itsm-your-app!t1234
```

- Scopes are mapped from the XSUAA token claims.

---

## 10. Users, Roles & Scopes

### Roles

| Role | Description |
|------|-------------|
| `admin` | Full access — manage users, app settings, all tickets |
| `agent` | Can be assigned tickets, add work notes, transition states |
| `requester` | Can create tickets and view their own tickets only |

### Scopes (derived from role)

| Scope | Granted to |
|-------|-----------|
| `TicketRead` | admin, agent, requester |
| `TicketWrite` | admin, agent |
| `Agent` | admin, agent |
| `Admin` | admin only |

Route guards (`RequireAuth`, `RequireSetup`) and API endpoints check scopes via `require_scope()`.

### Creating users

In fake-auth mode, users are created via the seed script or directly in the `users` table. In real mode, users are provisioned via SAP BTP Identity Authentication Service (IAS) and mapped to XSUAA scopes.

---

## 11. Seed Development Data

The seed script populates a fresh database with representative sample data:

```bash
cd backend
uv run python scripts/seed_dev.py
```

**Users created:**

| Email | Name | Role |
|-------|------|------|
| `admin@acme.com` | Alex Admin | admin |
| `sarah.chen@acme.com` | Sarah Chen | agent |
| `james.park@acme.com` | James Park | requester |

**Incidents created:**

| Number | Title | Priority | State |
|--------|-------|----------|-------|
| INC-001 | VPN not connecting | High | assigned |
| INC-002 | Outlook crashes on startup | Medium | in_progress |
| INC-003 | Cannot access SAP S/4HANA after password reset | Critical | new |
| INC-004 | Laptop keyboard unresponsive | Medium | resolved |
| INC-005 | Printer offline in Building A | Low | closed |

**Events:** 11 total (state changes, comments, work notes across all incidents)

**Attachments:** 1 file reference on INC-001 (`vpn_error_screenshot.png`)

---

## 12. Running Tests

### All tests (SQLite in-memory):

```bash
cd backend
uv run pytest
```

### Single file:

```bash
uv run pytest tests/test_incident_service.py -v
```

### Single test:

```bash
uv run pytest tests/test_state_machine.py::test_valid_transition -v
```

### Against real SAP HANA:

```bash
cd backend
HANA_TEST=1 uv run pytest -v
```

This creates `ITSM_TEST_*` tables in the HANA schema, runs all tests, then drops them.

### Frontend type-check:

```bash
cd frontend
npx tsc --noEmit
```

---

## 13. SAP BTP Deployment

Deployment artefacts live in `deploy/`. The expected setup:

1. Create an SAP BTP subaccount with a Cloud Foundry space.
2. Provision an SAP HANA Cloud instance and create an HDI container.
3. Set all required env vars in the CF app manifest or as CF user-provided services.
4. Set `AUTH_MODE=real` and fill in XSUAA env vars.
5. Build the frontend: `cd frontend && npm run build` (output in `frontend/dist/`).
6. The FastAPI backend serves the built frontend from `/` in production.
7. Push with `cf push` using the manifest in `deploy/`.

---

## 14. Troubleshooting

### "No such table: users" during tests

The `TABLE_PREFIX` in `backend/.env` is non-empty. Tests always expect no prefix. Remove or blank out `TABLE_PREFIX` in `.env`.

### Vite fails to resolve `react-is` (recharts dependency)

```bash
cd frontend
npm install react-is --legacy-peer-deps
# Clear Vite's dependency cache
Remove-Item -Recurse -Force node_modules\.vite\deps   # PowerShell
# or: rm -rf node_modules/.vite/deps               # bash
npm run dev
```

### Alembic "Target database is not up to date"

```bash
cd backend
uv run alembic upgrade head
```

### Reset local database completely

```bash
cd backend
rm dev.db                           # or Remove-Item dev.db on PowerShell
uv run alembic upgrade head
uv run python scripts/seed_dev.py   # optional: re-seed
```

### HANA connection errors

- Verify `HANA_ADDRESS`, `HANA_PORT`, `HANA_USER`, `HANA_PASSWORD`, `HANA_SCHEMA` in `.env.hana`.
- Ensure `hdbcli` is installed: `uv add hdbcli`.
- Try `uv run python scripts/inspect_hana.py` — if it connects, the env is correct.

### App stays on `/setup` after completing wizard

The `app_settings` row was not persisted. Check the backend logs for errors on `POST /api/setup`. Re-run the wizard or insert a row directly:
```sql
INSERT INTO app_settings (id, company_name, timezone, setup_completed_at)
VALUES ('singleton', 'My Company', 'UTC', datetime('now'));
```
