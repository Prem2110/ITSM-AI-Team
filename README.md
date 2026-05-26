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
