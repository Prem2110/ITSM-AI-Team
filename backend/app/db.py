from __future__ import annotations
import asyncio
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
_is_hana = "hana" in _db_url or "hdbcli" in _db_url


def _hana_extra_from_vcap() -> dict:
    """Extract schema and SSL cert from VCAP_SERVICES hana binding, if present."""
    vcap_raw = os.environ.get("VCAP_SERVICES", "")
    if not vcap_raw:
        return {}
    try:
        vcap = json.loads(vcap_raw)
        creds = vcap.get("hana", [{}])[0].get("credentials", {})
        extras: dict = {}
        if creds.get("schema"):
            extras["schema"] = creds["schema"]
        if creds.get("certificate"):
            extras["sslTrustStore"] = creds["certificate"]
        return extras
    except (json.JSONDecodeError, IndexError, KeyError):
        return {}


def _hana_connect_args() -> dict:
    """Build hdbcli connect_args: VCAP_SERVICES schema/cert > env_settings fallback."""
    vcap_extras = _hana_extra_from_vcap()
    args: dict = {
        "encrypt": env_settings.hana_encrypt,
        "sslValidateCertificate": env_settings.hana_ssl_validate,
    }
    schema = vcap_extras.get("schema") or env_settings.hana_schema
    if schema:
        args["CURRENTSCHEMA"] = schema
    if vcap_extras.get("sslTrustStore"):
        args["sslTrustStore"] = vcap_extras["sslTrustStore"]
    return args


class SyncToAsyncSessionBridge:
    """Async interface over a synchronous SQLAlchemy Session for SAP HANA (hdbcli).

    hdbcli is sync-only. AsyncEngine(sync_engine) is rejected by SQLAlchemy 2.0.
    This bridge dispatches each I/O operation to asyncio.to_thread() so the event
    loop is not blocked. Non-I/O ops (add, expunge) stay synchronous.
    """
    def __init__(self, sync_session) -> None:
        self._s = sync_session

    @property
    def sync_session(self):
        return self._s

    # Non-I/O (synchronous)
    def add(self, instance, _warn: bool = True) -> None:     self._s.add(instance)
    def add_all(self, instances) -> None:                    self._s.add_all(instances)
    def expunge(self, instance) -> None:                     self._s.expunge(instance)
    def expunge_all(self) -> None:                           self._s.expunge_all()

    # I/O ops — each dispatched to a thread
    async def execute(self, statement, params=None, **kw):
        if params is not None:
            return await asyncio.to_thread(self._s.execute, statement, params, **kw)
        return await asyncio.to_thread(self._s.execute, statement, **kw)

    async def scalar(self, statement, params=None, **kw):
        if params is not None:
            return await asyncio.to_thread(self._s.scalar, statement, params, **kw)
        return await asyncio.to_thread(self._s.scalar, statement, **kw)

    async def flush(self, objects=None) -> None:
        if objects is not None:
            await asyncio.to_thread(self._s.flush, objects)
        else:
            await asyncio.to_thread(self._s.flush)

    async def commit(self) -> None:
        await asyncio.to_thread(self._s.commit)

    async def rollback(self) -> None:
        await asyncio.to_thread(self._s.rollback)

    async def close(self) -> None:
        await asyncio.to_thread(self._s.close)

    async def refresh(self, instance, attribute_names=None, **kw) -> None:
        if attribute_names is not None:
            await asyncio.to_thread(self._s.refresh, instance, attribute_names, **kw)
        else:
            await asyncio.to_thread(self._s.refresh, instance, **kw)

    async def delete(self, instance) -> None:
        await asyncio.to_thread(self._s.delete, instance)

    async def get(self, entity, ident, **kw):
        return await asyncio.to_thread(self._s.get, entity, ident, **kw)

    def begin(self):
        """Return an async CM that commits on success, rolls back on failure."""
        return _BridgeTxContext(self)

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if exc_type is not None:
            await self.rollback()
        await self.close()


class _BridgeTxContext:
    def __init__(self, bridge: SyncToAsyncSessionBridge) -> None:
        self._b = bridge

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if exc_type is not None:
            await self._b.rollback()
        else:
            await self._b.commit()


class _HANASessionMaker:
    """Mimics async_sessionmaker for HANA sync sessions.

    _HANASessionMaker(factory)() returns an async context manager that yields a
    SyncToAsyncSessionBridge — same usage as async_sessionmaker()().
    """
    def __init__(self, sync_factory) -> None:
        self._factory = sync_factory

    def __call__(self):
        return _HANASessionContext(self._factory)


class _HANASessionContext:
    def __init__(self, sync_factory) -> None:
        self._factory = sync_factory
        self._bridge: SyncToAsyncSessionBridge | None = None

    async def __aenter__(self) -> SyncToAsyncSessionBridge:
        self._bridge = SyncToAsyncSessionBridge(self._factory())
        return self._bridge

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        if self._bridge is not None:
            if exc_type is not None:
                await self._bridge.rollback()
            await self._bridge.close()


if _is_hana:
    # hdbcli is sync-only. Use a sync Engine + SyncToAsyncSessionBridge.
    from sqlalchemy import create_engine as _sync_create_engine, NullPool as _NullPool
    from sqlalchemy.orm import sessionmaker as _sessionmaker

    _hana_engine = _sync_create_engine(
        _db_url, echo=False, poolclass=_NullPool, connect_args=_hana_connect_args()
    )
    _hana_sync_factory = _sessionmaker(
        _hana_engine, expire_on_commit=False, autocommit=False, autoflush=False
    )
    engine = None  # No AsyncEngine; HANA uses SyncToAsyncSessionBridge
    AsyncSessionLocal = _HANASessionMaker(_hana_sync_factory)

    async def get_db():  # type: ignore[misc]
        bridge = SyncToAsyncSessionBridge(_hana_sync_factory())
        try:
            yield bridge
            await bridge.commit()
        except Exception:
            await bridge.rollback()
            raise
        finally:
            await bridge.close()

else:
    engine = create_async_engine(
        _db_url,
        echo=False,
        connect_args={"check_same_thread": False} if "sqlite" in _db_url else {},
    )
    AsyncSessionLocal = async_sessionmaker(
        engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autocommit=False,
        autoflush=False,
    )

    async def get_db() -> AsyncGenerator[AsyncSession, None]:  # type: ignore[misc]
        async with AsyncSessionLocal() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=_naming_convention)


__all__ = [
    "engine",
    "AsyncSessionLocal",
    "Base",
    "get_db",
    "resolve_database_url",
    "_hana_connect_args",
    "SyncToAsyncSessionBridge",
]
