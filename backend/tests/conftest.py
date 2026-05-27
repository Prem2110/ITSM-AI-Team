from __future__ import annotations
import asyncio
import dataclasses
import sys
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.db import Base, get_db
import app.models  # noqa: F401 — registers all models with Base.metadata

# ── Windows / hdbcli pre-initialization ───────────────────────────────────────
# hdbcli on Windows uses OpenSSL for TLS connections. If the FIRST connect()
# call happens while an asyncio event loop is already running in another thread
# (which pytest_asyncio starts before the first test), the DLL crashes with an
# access violation — a race in the OpenSSL/Winsock global init path.
#
# Fix: force hdbcli to initialize its DLL globals here, at conftest import time.
# This runs during pytest's collection phase, before pytest_asyncio has created
# any event loop threads. All subsequent connect() calls (including those from
# asyncio thread-pool workers) are then safe because the globals are already set.
from app.config import env_settings as _cfg
if _cfg.hana_test:
    try:
        from hdbcli import dbapi as _hdbcli_init
        _pre = _hdbcli_init.connect(
            address=_cfg.hana_address,
            port=_cfg.hana_port,
            user=_cfg.hana_user,
            password=_cfg.hana_password,
            encrypt=_cfg.hana_encrypt,
            sslValidateCertificate=_cfg.hana_ssl_validate,
        )
        _pre.close()
        del _pre, _hdbcli_init
    except Exception as _pre_err:
        import warnings as _w
        _w.warn(f"hdbcli pre-init failed — HANA tests may crash: {_pre_err}")
        del _w, _pre_err

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

# ─────────────────────────────────────────────────────────────────────────────


@dataclasses.dataclass
class SeedUser:
    id: str
    email: str
    name: str
    role: str


async def _seed_user(factory, email: str, name: str, role: str) -> SeedUser:
    from app.repositories.user_repository import UserRepository
    from app.schemas.user import UserCreate
    async with factory() as session:
        user = await UserRepository(session).create(
            UserCreate(email=email, name=name, role=role)
        )
        await session.commit()
        return SeedUser(id=user.id, email=user.email, name=user.name, role=user.role)


# ── HANA test infrastructure ──────────────────────────────────────────────────

_HANA_TEST_ENGINE = None  # session-scope singleton


def _get_hana_engine():
    global _HANA_TEST_ENGINE
    if _HANA_TEST_ENGINE is None:
        from sqlalchemy import create_engine, NullPool
        from app.db import resolve_database_url, _hana_connect_args
        url = resolve_database_url()
        if not ("hana" in url or "hdbcli" in url):
            raise RuntimeError(
                "HANA_TEST=1 is set but no HANA URL resolved. "
                "Check HANA_ADDRESS/PORT/USER/PASSWORD in .env.hana"
            )
        _HANA_TEST_ENGINE = create_engine(url, poolclass=NullPool, connect_args=_hana_connect_args())
    return _HANA_TEST_ENGINE


def _hana_existing_tables(engine) -> set:
    """Return lowercase set of table names currently in the HANA schema."""
    from sqlalchemy import text as _text
    with engine.connect() as conn:
        rows = conn.execute(_text(
            "SELECT LOWER(TABLE_NAME) FROM SYS.TABLES WHERE SCHEMA_NAME = CURRENT_SCHEMA"
        )).fetchall()
    return {r[0] for r in rows}


# Explicit FK-safe order for DML/DDL operations on HANA.
# sorted_tables / reversed(sorted_tables) can mis-order when hdbcli FK names
# use mixed-case prefixed strings; hardcoding avoids FK constraint violations.
_HANA_BASE_TABLES = ["incident_events", "attachments", "incidents", "users"]  # children → parents


def _create_hana_test_tables(engine) -> None:
    from app.config import tbl as _tbl
    from sqlalchemy import text as _text
    existing = _hana_existing_tables(engine)
    # Create parents before children (reverse of delete order)
    for base_name in reversed(_HANA_BASE_TABLES):
        table_name = _tbl(base_name)
        if table_name.lower() not in existing:
            table = Base.metadata.tables[table_name]
            table.create(engine)
    # Create incident number sequence if it doesn't exist
    seq_name = _tbl("INC_SEQ")
    with engine.connect() as conn:
        exists = conn.execute(_text(
            f"SELECT COUNT(*) FROM SYS.SEQUENCES WHERE SCHEMA_NAME = CURRENT_SCHEMA AND SEQUENCE_NAME = '{seq_name}'"
        )).scalar()
        if not exists:
            conn.execute(_text(f'CREATE SEQUENCE "{seq_name}" START WITH 1 INCREMENT BY 1'))
        conn.commit()


def _drop_hana_test_tables(engine) -> None:
    from app.config import tbl as _tbl
    from sqlalchemy import text as _text
    existing = _hana_existing_tables(engine)
    seq_name = _tbl("INC_SEQ")
    # Drop children before parents to avoid FK constraint violations
    with engine.connect() as conn:
        for base_name in _HANA_BASE_TABLES:
            table_name = _tbl(base_name)
            if table_name.lower() in existing:
                conn.execute(_text(f'DROP TABLE "{table_name}"'))
        # Drop sequence
        seq_exists = conn.execute(_text(
            f"SELECT COUNT(*) FROM SYS.SEQUENCES WHERE SCHEMA_NAME = CURRENT_SCHEMA AND SEQUENCE_NAME = '{seq_name}'"
        )).scalar()
        if seq_exists:
            conn.execute(_text(f'DROP SEQUENCE "{seq_name}"'))
        conn.commit()


def _truncate_hana_test_tables(engine) -> None:
    from app.config import tbl as _tbl
    from sqlalchemy import text as _text
    seq_name = _tbl("INC_SEQ")
    # Delete children before parents to avoid FK constraint violations
    with engine.connect() as conn:
        for base_name in _HANA_BASE_TABLES:
            conn.execute(_text(f'DELETE FROM "{_tbl(base_name)}"'))
        # Reset sequence so each test starts numbering from INC0000001
        conn.execute(_text(f'ALTER SEQUENCE "{seq_name}" RESTART WITH 1'))
        conn.commit()


# pytest_sessionstart / pytest_sessionfinish run on the main thread before any
# test (and before pytest_asyncio creates its event loop threads), ensuring
# hdbcli's create_all / drop_all calls never race with asyncio.

def pytest_sessionstart(session: pytest.Session) -> None:
    if not _cfg.hana_test:
        return
    engine = _get_hana_engine()
    _create_hana_test_tables(engine)


def pytest_sessionfinish(session: pytest.Session, exitstatus: int) -> None:
    if not _cfg.hana_test:
        return
    global _HANA_TEST_ENGINE
    if _HANA_TEST_ENGINE is not None:
        _drop_hana_test_tables(_HANA_TEST_ENGINE)
        _HANA_TEST_ENGINE.dispose()
        _HANA_TEST_ENGINE = None


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def db_session() -> AsyncSession:
    from app.config import env_settings
    if not env_settings.hana_test:
        # Original SQLite in-memory path (unchanged)
        engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
        async with factory() as session:
            yield session
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
        await engine.dispose()
    else:
        from sqlalchemy.orm import sessionmaker, Session
        from app.db import SyncToAsyncSessionBridge
        hana_engine = _get_hana_engine()
        SyncSession = sessionmaker(hana_engine, expire_on_commit=False, autoflush=False)
        sync_session = SyncSession()
        bridge = SyncToAsyncSessionBridge(sync_session)
        yield bridge
        await bridge.rollback()
        await bridge.close()
        _truncate_hana_test_tables(hana_engine)


@pytest_asyncio.fixture
async def test_db():
    from app.config import env_settings
    if not env_settings.hana_test:
        # Original SQLite in-memory path (unchanged)
        engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
        yield factory
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
        await engine.dispose()
    else:
        from sqlalchemy.orm import sessionmaker
        from app.db import SyncToAsyncSessionBridge, _HANASessionMaker
        hana_engine = _get_hana_engine()
        sync_factory = sessionmaker(hana_engine, expire_on_commit=False, autoflush=False)
        yield _HANASessionMaker(sync_factory)
        _truncate_hana_test_tables(hana_engine)


@pytest_asyncio.fixture
async def client(test_db):
    from app.main import app

    async def override_get_db():
        async with test_db() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac
    app.dependency_overrides.clear()
