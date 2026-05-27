from __future__ import annotations
import asyncio
import dataclasses
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.db import Base, get_db
import app.models  # noqa: F401 — registers all models with Base.metadata


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


async def _create_hana_test_tables(engine) -> None:
    await asyncio.to_thread(lambda: Base.metadata.create_all(engine))


async def _drop_hana_test_tables(engine) -> None:
    await asyncio.to_thread(lambda: Base.metadata.drop_all(engine))


async def _truncate_hana_test_tables(engine) -> None:
    from sqlalchemy import text as _text

    def _do_truncate():
        with engine.connect() as conn:
            for tbl in reversed(Base.metadata.sorted_tables):
                conn.execute(_text(f'DELETE FROM "{tbl.name}"'))
            conn.commit()

    await asyncio.to_thread(_do_truncate)


@pytest_asyncio.fixture(scope="session", autouse=True)
async def _hana_session_setup():
    """Create HANA test tables at session start, drop at session end.

    Only active when HANA_TEST=1; no-op otherwise.
    """
    from app.config import env_settings
    if not env_settings.hana_test:
        yield
        return
    engine = _get_hana_engine()
    await _create_hana_test_tables(engine)
    yield
    await _drop_hana_test_tables(engine)
    await asyncio.to_thread(engine.dispose)
    global _HANA_TEST_ENGINE
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
        await _truncate_hana_test_tables(hana_engine)


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
        await _truncate_hana_test_tables(hana_engine)


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
