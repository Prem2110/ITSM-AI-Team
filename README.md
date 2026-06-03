# Sierra Digital ITSM

> **New here?** Read the [Client Onboarding Guide](CLIENTONBOARDING.md) for step-by-step setup and troubleshooting.

A single-tenant IT Service Management tool built by Sierra Digital — a simplified ServiceNow-like ticketing system with AI-powered predictive analytics. Each customer gets their own deployment on SAP BTP Cloud Foundry.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend API | Python 3.11+, FastAPI, SQLAlchemy 2.0 (async), Alembic |
| Database | SAP HANA (production) / SQLite (local dev) |
| Frontend | React 18, Vite, TypeScript, Tailwind CSS, TanStack Query, Framer Motion |
| Charts | Recharts |
| AI | OpenRouter API (any LLM — auto-classify, similar incidents, agent suggestions, summarize, draft reply, ops summary, handoff report) |
| Collaboration | Live presence & field locking via WebSockets |
| i18n | English, French, German, Spanish, Mandarin, Hindi |
| Auth | Fake-auth stub (current) / SAP XSUAA JWT (add back post-stabilisation) |
| Deployment | SAP BTP Cloud Foundry (MTA) |

---

## Prerequisites

- Python 3.11+
- Node.js 20+
- [uv](https://docs.astral.sh/uv/) — `pip install uv`

---

## Quick Start (Local Dev)

### 1. Backend

```bash
cd backend
cp .env.example .env          # defaults to SQLite + AUTH_MODE=fake
uv sync
uv run alembic upgrade head   # creates dev.db with all tables
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

Open `http://localhost:5173`. On a fresh database the app redirects to `/setup`. Complete the wizard, then log in with any email from the seeded users:

| Email | Name | Role |
|-------|------|------|
| `karthik.byju@sierradigital.com` | Karthik Byju | Admin |
| `prem@sierradigital.com` | Prem | Agent |
| `ashok@sierradigital.com` | Ashok | Requester |

---

## Project Structure

```
ITSM/
├── mta.yaml                    MTA build descriptor (BTP deployment)
├── deploy/
│   ├── approuter/
│   │   ├── xs-app.json         AppRouter routing + auth config
│   │   └── package.json        @sap/approuter dependency
│   ├── xs-security.json        XSUAA scopes + role collections (for when XSUAA is re-added)
│   └── README.md               BTP deployment step-by-step guide
├── backend/
│   ├── app/
│   │   ├── auth/               Fake dev auth + XSUAA JWT validation (VCAP_SERVICES-aware)
│   │   ├── models/             SQLAlchemy ORM: User, Incident, IncidentEvent, Attachment, AppSettings
│   │   ├── repositories/       SQL data access — one file per model
│   │   ├── services/
│   │   │   ├── incident_service.py   Business logic: create, transition, SLA, escalation
│   │   │   ├── ai_service.py         OpenRouter LLM client (classify, similar, suggest-assignee, summarize, draft-reply, draft-resolution, handoff-report)
│   │   │   └── numbering.py          Incident number sequencing (format: TCK-YYYYMMDD-NNNNN)
│   │   ├── routers/
│   │   │   ├── incidents.py    CRUD + transition + CSV export
│   │   │   ├── ai.py           AI endpoints: SLA risk, anomalies, forecast, workload, classify
│   │   │   ├── dashboard.py    Stats, trends, SLA compliance, KPIs
│   │   │   ├── setup.py        Setup wizard + app settings
│   │   │   ├── users.py        User listing
│   │   │   ├── events.py       Incident audit trail
│   │   │   ├── attachments.py  File attachments
│   │   │   ├── session.py      Current user / session info
│   │   │   └── config.py       Config endpoint (priorities, categories, states)
│   │   ├── schemas/            Pydantic request/response models
│   │   ├── middleware/         SetupGuardMiddleware (redirect to /setup on first run)
│   │   ├── config.py           Config loader: YAML + env + VCAP_SERVICES
│   │   ├── db.py               SQLAlchemy engine (async SQLite / sync HANA bridge)
│   │   ├── main.py             FastAPI app, CORS, middleware, router registration
│   │   ├── state_machine.py    Transition validator
│   │   └── types.py            JSONText TypeDecorator (HANA-compatible JSON columns)
│   ├── alembic/
│   │   └── versions/           Migration scripts (SQLite + HANA compatible)
│   ├── scripts/                seed_dev.py, inspect_hana.py, cleanup_hana.py
│   ├── config.yaml             Per-customer settings (priorities, categories, states)
│   ├── Procfile                CF start command: alembic upgrade head && uvicorn
│   ├── runtime.txt             python-3.11.x
│   ├── requirements.txt        CF buildpack dependencies (pip)
│   └── .env.example            Environment variable template
└── frontend/
    └── src/
        ├── api/                Axios client + per-domain fetch helpers (incidents, ai, setup, …)
        ├── assets/             Static assets (Sierra Digital logo)
        ├── components/         Layout (with Sierra logo), SettingsModal, KanbanBoard, badges, skeletons
        ├── contexts/           SettingsContext (theme, font, font size, language, dark mode)
        ├── hooks/              React Query hooks (useIncidents, useMe, useDashboard, useAI, …)
        ├── locales/            i18n JSON files — en, fr, de, es, zh, hi
        ├── pages/
        │   ├── Dashboard.tsx             Stats cards + Recharts charts
        │   ├── PredictiveAnalytics.tsx   SLA risk, anomalies, forecast, workload, historical panels, AI ops summary
        │   ├── Incidents.tsx             Filterable/paginated list + Kanban board toggle
        │   ├── IncidentDetail.tsx        View, edit, transition, comment, AI help drawer, live collaboration
        │   ├── IncidentNew.tsx           Create incident form (with AI auto-classify)
        │   ├── Setup.tsx                 First-run wizard
        │   └── Login.tsx                 Fake-auth email picker
        └── router.tsx              Route definitions + lazy loading
```

---

## Architecture

### Backend layers

```
HTTP request
  → router        (require_scope() auth check, serialisation)
  → service       (business logic: create, transition, SLA, AI)
  → repository    (async SQLAlchemy queries)
  → model         (ORM class → DB table)
```

### Configuration — two layers

| File | Contents | Loaded into |
|------|----------|------------|
| `backend/config.yaml` | Per-customer: company name, number prefix, priorities (SLA hours), categories, states, transitions | `app_config` (at import time) |
| `backend/.env` | Runtime secrets: `DATABASE_URL`, `AUTH_MODE`, XSUAA vars, `CORS_ORIGINS`, `TABLE_PREFIX`, `HANA_*` | `env_settings` (Pydantic Settings) |

On BTP, `VCAP_SERVICES` is parsed automatically for HANA and XSUAA credentials — env vars take priority over `.env` file values.

### Auth modes

| `AUTH_MODE` | Where used | How it works |
|-------------|------------|-------------|
| `fake` | Local dev + current BTP deploy | Frontend sends `X-Fake-User: <email>`; backend looks up user by email and maps role → scopes |
| `real` | BTP with XSUAA re-enabled | Backend validates SAP XSUAA JWT from `VCAP_SERVICES`; scopes come from token claims |

### Scope → permission mapping

| Scope | Granted to | Can do |
|-------|-----------|--------|
| `TicketRead` | Viewer, Support, Agent, Admin | Read incidents, events, dashboard |
| `TicketWrite` | Support, Agent, Admin | Create incidents, add comments, transitions |
| `Agent` | Agent, Admin | Assign, patch, escalate, view agent workload |
| `Admin` | Admin | App settings, AI config, user management |

### State machine

Transitions are driven entirely by `config.yaml → state_transitions`. `state_machine.validate_transition()` raises `ValueError` for:
- Any transition not listed in the config map
- Transitioning to `resolved` without both `resolution_code` and `resolution_notes`

### SLA tracking

On incident creation, `sla_resolution_due = now + priority.sla_hours`. Each request to the list/detail endpoints calls `mark_overdue_sla_breached()` which bulk-updates `sla_breached = true` for overdue open incidents. Incidents in `on_hold` state are excluded (SLA paused).

---

## API Reference

### Core

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| GET | `/health` | — | Health check |
| GET | `/api/session` | TicketRead | Current user + scopes |
| GET | `/api/config` | TicketRead | Priorities, categories, states |
| GET | `/api/setup/status` | — | Whether first-run setup is complete |
| POST | `/api/setup/complete` | — | Complete setup wizard |
| GET | `/api/settings` | TicketRead | App settings (company, SLA targets, etc.) |
| PATCH | `/api/settings` | Admin | Update app settings |

### Incidents

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| GET | `/api/incidents` | TicketRead | List (filterable by state, priority, assignee, category, SLA; paginated) |
| POST | `/api/incidents` | TicketWrite | Create incident |
| GET | `/api/incidents/{id}` | TicketRead | Incident detail with events |
| PATCH | `/api/incidents/{id}` | Agent | Update fields (title, priority, category, assignee) |
| POST | `/api/incidents/{id}/transition` | TicketWrite | Workflow state transition |
| POST | `/api/incidents/escalations/run` | Agent | Auto-escalate SLA-breached incidents |
| GET | `/api/incidents/reports/export.csv` | TicketRead | CSV export |

### Events & Attachments

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| GET | `/api/incidents/{id}/events` | TicketRead | Audit trail |
| POST | `/api/incidents/{id}/events` | TicketWrite | Add comment / work note |
| POST | `/api/attachments` | TicketWrite | Upload file |
| GET | `/api/attachments/{id}` | TicketRead | Download file |

### Dashboard

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| GET | `/api/dashboard/summary` | TicketRead | Stat cards (open, unassigned, breached, my open) |
| GET | `/api/dashboard/trends` | TicketRead | Created vs resolved per day |
| GET | `/api/dashboard/sla-compliance` | TicketRead | SLA met % |
| GET | `/api/dashboard/top-categories` | TicketRead | Incident count by category |
| GET | `/api/dashboard/ops-kpis` | TicketRead | Avg resolution hours, reopened, overdue |
| GET | `/api/dashboard/sla-breach-heatmap` | TicketRead | SLA breach rate by category × priority |
| GET | `/api/dashboard/peak-volume` | TicketRead | Incident volume heatmap by weekday × 4-hour block |
| GET | `/api/dashboard/reopen-rate` | TicketRead | Reopen rate by category |
| GET | `/api/dashboard/resolution-time` | TicketRead | Avg + P50 resolution hours by category |

### AI & Predictive Analytics

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| GET | `/api/ai/status` | TicketRead | Whether AI is enabled + configured model |
| PATCH | `/api/ai/settings` | Admin | Enable/disable AI, set OpenRouter API key + model |
| POST | `/api/ai/test-connection` | Admin | Test the configured OpenRouter key |
| GET | `/api/ai/sla-risk` | TicketRead | Open incidents ranked by SLA risk score (0–1) |
| GET | `/api/ai/anomalies` | TicketRead | Categories with 2.5× normal incident volume (last 2h) |
| GET | `/api/ai/forecast` | TicketRead | 14-day history + 7-day linear forecast |
| GET | `/api/ai/agent-workload` | Agent | Per-agent open count, resolved last 30d, avg hours |
| POST | `/api/ai/classify` | TicketWrite | AI-suggest priority + category for a new incident |
| GET | `/api/ai/incidents/{id}/similar` | TicketRead | Top 3 similar resolved incidents (AI) |
| POST | `/api/ai/suggest-assignee` | Agent | AI-suggest best agent for an incident |
| POST | `/api/ai/incidents/{id}/summarize` | TicketRead | Summarize the full comment thread in 2–3 sentences |
| POST | `/api/ai/incidents/{id}/draft-reply` | TicketWrite | Draft a customer-facing reply based on thread |
| POST | `/api/ai/incidents/{id}/draft-resolution` | TicketWrite | Draft resolution notes from the comment thread |
| POST | `/api/ai/handoff-report` | Agent | Generate a structured shift handoff report for all open incidents |
| POST | `/api/ai/ops-summary` | Agent | Generate a weekly operational health narrative |

### Users

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| GET | `/api/users` | Agent | List all users |

---

## Frontend Routes

| Path | Page |
|------|------|
| `/setup` | First-run setup wizard |
| `/login` | Email picker (fake auth) |
| `/dashboard` | Stats cards + Recharts charts |
| `/analytics` | Predictive Analytics: SLA risk, anomalies, forecast, agent workload, AI widgets |
| `/incidents` | Filterable, paginated incident list |
| `/incidents/new` | Create incident (with AI auto-classify) |
| `/incidents/:id` | Incident detail: view, edit, transition, comment, similar incidents |

---

## Database Tables

| Table | Purpose |
|-------|---------|
| `users` | All users (admin / agent / requester) |
| `incidents` | Tickets — one row per incident |
| `incident_events` | Append-only audit trail (comments, state changes, work notes) |
| `attachments` | File attachment metadata + blob |
| `app_settings` | Singleton set by setup wizard (company, SLA targets, AI config) |

`app_settings` AI columns: `ai_enabled` (SmallInt), `openrouter_api_key` (String), `openrouter_model` (String).

HANA deployments also create a sequence `{PREFIX}INC_SEQ` for ticket numbering.

---

## Configuration Reference

### `backend/config.yaml`

```yaml
company_name: "Sierra Digital"
number_prefix: "TCK"          # ticket numbers: TCK-YYYYMMDD-00001, TCK-YYYYMMDD-00002, …

priorities:                   # index = priority int in API (0 = highest)
  - name: Highly Critical  sla_hours: 1
  - name: Critical         sla_hours: 4
  - name: High             sla_hours: 8
  - name: Medium           sla_hours: 24
  - name: Low              sla_hours: 72

categories:
  - Network | Hardware | Software | Account Access | SAP Integration

states:
  - new | assigned | in_progress | on_hold | resolved | closed

state_transitions:
  new:         [assigned]
  assigned:    [in_progress, on_hold, new]
  in_progress: [on_hold, resolved, assigned]
  on_hold:     [in_progress, assigned]
  resolved:    [closed, in_progress]
  closed:      []
```

### `backend/.env` key variables

| Variable | Default | Notes |
|----------|---------|-------|
| `DATABASE_URL` | `sqlite+aiosqlite:///./dev.db` | Override for non-HANA production |
| `AUTH_MODE` | `fake` | `fake` or `real` (XSUAA) |
| `TABLE_PREFIX` | *(empty)* | Prefix for all table names e.g. `ITSMAI_` |
| `CORS_ORIGINS` | `["*"]` | Restrict to approuter URL in production |
| `HANA_ADDRESS` | *(empty)* | HANA Cloud host |
| `HANA_PORT` | `0` | Usually `443` |
| `HANA_USER` | *(empty)* | HDI runtime user |
| `HANA_PASSWORD` | *(empty)* | |
| `HANA_SCHEMA` | *(empty)* | Explicit schema (optional — auto-detected from VCAP_SERVICES) |
| `HANA_ENCRYPT` | `true` | |
| `HANA_SSL_VALIDATE` | `false` | |

---

## External API Integration

Any system can create incidents by POSTing directly to the backend:

```bash
curl -X POST https://<itsm-api-url>/api/incidents \
  -H "Content-Type: application/json" \
  -H "X-Fake-User: admin@yourcompany.com" \
  -d '{
    "title": "SAP system down in Plant 1200",
    "description": "Users unable to log in since 09:00 UTC",
    "priority": 1,
    "category": "SAP Integration",
    "source": "email"
  }'
```

| Field | Required | Values |
|-------|----------|--------|
| `title` | ✅ | any string |
| `description` | ✅ | any string |
| `priority` | ✅ | `0` Highly Critical · `1` Critical · `2` High · `3` Medium · `4` Low |
| `category` | ✅ | `Network` · `Hardware` · `Software` · `Account Access` · `SAP Integration` |
| `source` | ✅ | `web` · `email` · `classifier_escalation` · `fix_failed_escalation` |
| `requester_id` | ❌ | UUID — defaults to the `X-Fake-User` |
| `assignee_id` | ❌ | UUID of an agent |

When XSUAA is re-enabled, replace `X-Fake-User` with `Authorization: Bearer <xsuaa_token>` obtained via client credentials flow.

---

## SAP BTP Deployment

See [`deploy/README.md`](deploy/README.md) for the full step-by-step guide. Summary:

```bash
# Prerequisites: mbt, CF CLI, CF MultiApps plugin
mbt build
cf login -a https://api.eu10.hana.ondemand.com
cf deploy mta_archives/itsm_0.1.0.mtar -f
```

The `Procfile` runs `alembic upgrade head` automatically before uvicorn on every deploy.

**Current BTP state:** `AUTH_MODE=fake`, XSUAA removed for initial stabilisation. Re-add by:
1. Restoring `itsm-xsuaa` resource in `mta.yaml`
2. Setting `AUTH_MODE: real`
3. Switching `xs-app.json` back to `authenticationMethod: route`

---

## AI Features

AI features are **opt-in** — disabled until an admin provides an [OpenRouter](https://openrouter.ai) API key in Settings → AI & Automation.

| Feature | Where | AI required |
|---------|-------|-------------|
| Auto-classify (priority + category suggestion) | New incident form + Predictive Analytics | ✅ |
| Similar resolved incidents | Incident detail → AI Help panel | ✅ |
| Thread summarizer | Incident detail → AI Help panel | ✅ |
| Draft customer reply | Incident detail → comment box | ✅ |
| Draft resolution notes | Incident detail → resolve form | ✅ |
| Weekly ops summary | Predictive Analytics → AI section | ✅ |
| Shift handoff report | Incidents list toolbar → modal | ✅ |
| Suggest assignee | Predictive Analytics → Agent workload | ✅ |
| SLA risk monitor | Predictive Analytics | — |
| Anomaly detection | Predictive Analytics | — |
| 7-day incident forecast | Predictive Analytics | — |
| Agent workload table | Predictive Analytics | — |
| SLA breach heatmap | Predictive Analytics → Historical patterns | — |
| Peak volume heatmap | Predictive Analytics → Historical patterns | — |
| Reopen rate by category | Predictive Analytics → Historical patterns | — |
| Resolution time by category | Predictive Analytics → Historical patterns | — |

Free OpenRouter models (GPT OSS 120B, Llama 3.3 70B, etc.) work fine for all AI features.

---

## Collaboration Features

Live multi-user collaboration is built on WebSockets:

- **Presence avatars** — see who else is viewing the same incident (up to 4 avatars in the header)
- **Field locking** — when an agent edits a field (title, description, priority, category, assignee) it is locked for other users until they finish; a lock badge shows who is editing
- **Real-time updates** — field changes broadcast instantly to all viewers of the same incident

---

## Localisation

The UI is fully internationalised via i18next. Supported languages:

| Code | Language |
|------|----------|
| `en` | English (default) |
| `fr` | French |
| `de` | German |
| `es` | Spanish |
| `zh` | Mandarin Chinese |
| `hi` | Hindi |

Switch language in Settings → Appearance → Language. The selection persists to `localStorage`.

---

## Running Tests

```bash
cd backend
uv run pytest                              # all tests (SQLite in-memory)
uv run pytest tests/test_incidents.py -v   # single file
HANA_TEST=1 uv run pytest -v               # against real HANA

cd frontend
npx tsc --noEmit                           # TypeScript type-check
```

---

## Useful Commands

```bash
# Backend
uv run alembic upgrade head                          # apply all migrations
uv run alembic revision --autogenerate -m "change"   # generate migration after model change
uv run python scripts/seed_dev.py                    # load sample data
uv run python scripts/inspect_hana.py                # check for HANA table collisions
uv run python scripts/cleanup_hana.py                # drop HANA tables (careful)

# Frontend
npm run dev        # dev server (http://localhost:5173)
npm run build      # production build → dist/
npx tsc --noEmit   # type-check without building

# BTP (from project root)
mbt build                                            # build .mtar archive
cf deploy mta_archives/itsm_0.1.0.mtar -f           # deploy to CF
cf logs itsm-api --recent                            # check backend logs
cf run-task itsm-api --command "alembic upgrade head" --name migrate   # manual migration
```
