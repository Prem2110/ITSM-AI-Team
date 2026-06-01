from __future__ import annotations
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .config import env_settings
from .routers import session, incidents, events, attachments, config, users, dashboard, setup, ai
from .middleware.setup_guard import SetupGuardMiddleware

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s — %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def _lifespan(application: FastAPI):
    from .db import resolve_database_url
    db_url = resolve_database_url()
    db_kind = "hana" if ("hana" in db_url or "hdbcli" in db_url) else "sqlite"
    logger.info(
        "ITSM API v%s starting — auth_mode=%s db=%s cors_origins=%s",
        application.version,
        env_settings.auth_mode,
        db_kind,
        env_settings.cors_origins,
    )
    yield
    logger.info("ITSM API shutting down")


app = FastAPI(
    title="ITSM API",
    version="0.1.0",
    description="Single-tenant IT Service Management API",
    lifespan=_lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=env_settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(SetupGuardMiddleware)

app.include_router(session.router)
app.include_router(incidents.router)
app.include_router(events.router)
app.include_router(attachments.router)
app.include_router(config.router)
app.include_router(users.router)
app.include_router(dashboard.router)
app.include_router(setup.router)
app.include_router(ai.router)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "version": app.version}
