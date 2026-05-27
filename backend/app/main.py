from __future__ import annotations
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .config import env_settings
from .routers import session, incidents, events, attachments, config, users, dashboard, setup

app = FastAPI(
    title="ITSM API",
    version="0.1.0",
    description="Single-tenant IT Service Management API",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=env_settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(session.router)
app.include_router(incidents.router)
app.include_router(events.router)
app.include_router(attachments.router)
app.include_router(config.router)
app.include_router(users.router)
app.include_router(dashboard.router)
app.include_router(setup.router)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "version": app.version}
