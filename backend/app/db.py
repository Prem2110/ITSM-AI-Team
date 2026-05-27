from __future__ import annotations
import json
import logging
import os
from collections.abc import AsyncGenerator
from sqlalchemy import MetaData
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from .config import env_settings

_naming_convention: dict[str, str] = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


def resolve_database_url() -> str:
    """Resolve DB URL in priority order: VCAP_SERVICES > HANA_* vars > DATABASE_URL."""
    # 1. VCAP_SERVICES (SAP BTP production)
    vcap_raw = os.environ.get("VCAP_SERVICES", "")
    if vcap_raw:
        try:
            vcap = json.loads(vcap_raw)
            creds = vcap.get("hana", [{}])[0].get("credentials", {})
            host = creds.get("host", "")
            port = creds.get("port", 0)
            user = creds.get("user", "")
            password = creds.get("password", "")
            if host and port and user and password:
                return f"hana+hdbcli://{user}:{password}@{host}:{port}/"
            elif any([host, port, user, password]):
                logging.warning(
                    "VCAP_SERVICES['hana'] has partial credentials (missing: %s); falling back to HANA_* env vars",
                    ", ".join(k for k, v in {"host": host, "port": port, "user": user, "password": password}.items() if not v),
                )
        except (json.JSONDecodeError, IndexError, KeyError):
            pass

    # 2. HANA_* env vars (dev .env.hana)
    if env_settings.hana_address and env_settings.hana_port and env_settings.hana_user:
        user = env_settings.hana_user
        password = env_settings.hana_password
        host = env_settings.hana_address
        port = env_settings.hana_port
        return f"hana+hdbcli://{user}:{password}@{host}:{port}/"

    # 3. DATABASE_URL from .env (SQLite default or explicit override)
    return env_settings.database_url


_db_url = resolve_database_url()


def _hana_connect_args() -> dict:
    """Build hdbcli connect_args from env_settings."""
    args: dict = {
        "encrypt": env_settings.hana_encrypt,
        "sslValidateCertificate": env_settings.hana_ssl_validate,
    }
    if env_settings.hana_schema:
        args["CURRENTSCHEMA"] = env_settings.hana_schema
    return args


def _make_engine():
    if "hana" in _db_url or "hdbcli" in _db_url:
        # hdbcli is a sync DBAPI; wrap sync engine in AsyncEngine for async session compat.
        # NullPool avoids thread-safety issues when greenlet-dispatching sync calls.
        from sqlalchemy import create_engine, NullPool
        from sqlalchemy.ext.asyncio import AsyncEngine
        sync_engine = create_engine(_db_url, echo=False, poolclass=NullPool, connect_args=_hana_connect_args())
        return AsyncEngine(sync_engine)
    else:
        return create_async_engine(
            _db_url,
            echo=False,
            connect_args={"check_same_thread": False} if "sqlite" in _db_url else {},
        )


engine = _make_engine()

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=_naming_convention)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


__all__ = ["engine", "AsyncSessionLocal", "Base", "get_db", "resolve_database_url"]
