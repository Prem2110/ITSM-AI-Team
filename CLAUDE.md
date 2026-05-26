# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Commands

### Backend

```bash
cd backend

# Install deps (uses uv)
uv sync

# Run dev server (http://localhost:8000)
uv run uvicorn app.main:app --reload --port 8000

# Apply migrations
uv run alembic upgrade head

# Seed dev database
uv run python scripts/seed_dev.py

# Run all tests
uv run pytest

# Run a single test file
uv run pytest tests/test_incident_service.py -v

# Run a single test
uv run pytest tests/test_state_machine.py::test_valid_transition -v

# Generate a new migration after model changes
uv run alembic revision --autogenerate -m "describe change"
```

### Frontend

```bash
cd frontend

npm install
npm run dev       # http://localhost:5173 (proxies /api/* → localhost:8000)
npm run build
npx tsc --noEmit  # type-check without emitting
```

---

## Architecture

### Monorepo layout

```
ITSM/
├── backend/      FastAPI + SQLAlchemy async
└── frontend/     React + Vite + TanStack Query
```

### Backend layers

```
routers/ → services/ → repositories/ → models/
```

- **Routers** own HTTP concerns (auth dependency injection via `require_scope()`, request/response serialization).
- **Services** own business logic (`IncidentService`: create, update, transition, SLA breach check). They call both repositories and emit events.
- **Repositories** own all SQL (pure async SQLAlchemy; no business logic).
- **Models** are SQLAlchemy ORM declarative classes. `Incident.assignee` is a `lazy="raise"` relationship — must be explicitly `selectinload`ed before accessing.

### Configuration: two layers

- **`config.yaml`** (checked in) — per-customer settings: `number_prefix`, `priorities` (with `sla_hours`), `categories`, `states`, `state_transitions`. Loaded once at import time into `app_config`.
- **`.env`** — environment settings via Pydantic Settings: `DATABASE_URL`, `AUTH_MODE` (`fake`|`real`), XSUAA vars, `CORS_ORIGINS`. Loaded into `env_settings`.

### Auth flow

`require_scope(*scopes)` returns a FastAPI `Depends`. At runtime it calls `get_caller()`, which dispatches to either:
- **`auth/fake.py`** — reads `X-Fake-User: <email>` header, looks up the user in DB, maps `role → scopes`
- **`auth/xsuaa.py`** — validates SAP XSUAA JWT, maps scopes from token

`CallerContext` carries `user_id`, `email`, `name`, `scopes: list[str]`. Scopes used: `TicketRead`, `TicketWrite`, `Agent`, `Admin`.

Frontend: `api/client.ts` Axios instance reads `localStorage` for the fake user email and attaches `X-Fake-User` header on every request.

### State machine

Transitions are driven entirely by `config.yaml`'s `state_transitions` map. `state_machine.validate_transition(from, to, payload)` raises `ValueError` if:
- the transition is not in the configured map, or
- transitioning to `resolved` without `resolution_code` + `resolution_notes`.

`IncidentService.transition_incident()` captures `from_state = incident.state` **before** calling `repo.update()` (Python strings are immutable — the captured value is not affected by the subsequent ORM setattr). The resulting `state_change` event stores `{"from_state": ..., "to_state": ...}`.

### Database session lifecycle

`get_db()` in `db.py` yields an `AsyncSession` with `autoflush=False`, `expire_on_commit=False`. The session is committed/rolled back in the dependency. Tests override `get_db` in `app.dependency_overrides` with an in-memory SQLite session that commits on success and rolls back on exception.

### Incident list endpoint

`GET /api/incidents` returns `IncidentListItem` objects that include `assignee_name`. The repository's `list()` uses `selectinload(Incident.assignee)` to eagerly load the assignee. The router builds `IncidentListItem` explicitly (not `model_validate`) to populate `assignee_name` from the loaded relationship.

### Frontend data flow

`SettingsContext` (wraps the whole app) persists `theme`, `fontSize`, `fontFamily` to `localStorage` and applies them immediately: `html.dark` class for dark mode, `body.style.zoom` for scale, `--ui-font` CSS variable for font. Dark mode is implemented via CSS class overrides in `index.css` (`html.dark .bg-white { ... }`) rather than Tailwind `dark:` variants — meaning new components with inline hex colors need to use CSS variables (`var(--bg-primary)`, `var(--border-color)`, etc.) to respond to dark mode.

Each data domain has a hook (`useIncident`, `useIncidents`, `useMe`, `useUsers`, `useConfig`) wrapping a React Query `useQuery`. `useUsers` accepts an `enabled` param to skip the call for non-agents (who get 403). Mutations call `qc.invalidateQueries` on success.

### Event metadata keys

All `state_change` events use `{ from_state, to_state }` — both from the seed script and the service. The frontend `EventItem` reads only `meta.from_state` / `meta.to_state` (no fallback to legacy keys).

---

## Key non-obvious constraints

- **`assignee` relationship is `lazy="raise"`** — always add `selectinload(Incident.assignee)` when you need it in a query.
- **`autoflush=False`** on the session — `flush()` must be called explicitly in the seed script between dependent inserts.
- **`expire_on_commit=False`** — ORM objects remain accessible after commit without re-fetching, which is why `from_state` can be safely captured before `update()` without being overwritten.
- **Scope-based auth, not role-based** — check `caller.scopes` not `caller.role`. Frontend: `me?.scopes?.includes('Agent')`.
- **`IncidentListItem` has no `from_attributes`** — built manually in the router; don't add `model_validate(orm_object)` calls for it.
- **Seed script** runs inside a single `async with session.begin():` block. The `existing` check is inside the same transaction (not before it) to avoid the double-begin error.
