from __future__ import annotations
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
    """Get or create the session-scoped HANA engine for tests."""
    global _HANA_TEST_ENGINE
    if _HANA_TEST_ENGINE is None:
        from sqlalchemy import create_engine, NullPool
        from sqlalchemy.ext.asyncio import AsyncEngine
        from app.db import resolve_database_url, _hana_connect_args
        url = resolve_database_url()
        if "hana" not in url and "hdbcli" not in url:
            raise RuntimeError(
                "HANA_TEST=1 is set but no HANA URL resolved. "
                "Check HANA_ADDRESS/PORT/USER/PASSWORD in .env.hana"
            )
        sync_engine = create_engine(url, poolclass=NullPool, connect_args=_hana_connect_args())
        _HANA_TEST_ENGINE = AsyncEngine(sync_engine)
    return _HANA_TEST_ENGINE


async def _create_hana_test_tables(engine) -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def _drop_hana_test_tables(engine) -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


async def _truncate_hana_test_tables(engine) -> None:
    """Truncate all test tables after each test for isolation.

    Uses DELETE FROM with double-quoted identifiers because HANA folds
    unquoted names to uppercase. Tables are deleted in reverse FK order
    (child tables first).
    """
    from sqlalchemy import text
    async with engine.begin() as conn:
        table_names = [t.name for t in Base.metadata.sorted_tables]
        for table_name in reversed(table_names):
            await conn.execute(text(f'DELETE FROM "{table_name}"'))


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
    await engine.dispose()
    global _HANA_TEST_ENGINE
    _HANA_TEST_ENGINE = None


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def db_session() -> AsyncSession:
    from app.config import env_settings
    if not env_settings.hana_test:
        # Original SQLite in-memory path
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
        # HANA path: use shared session-scoped engine, truncate after each test
        engine = _get_hana_engine()
        factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession, autoflush=False)
        async with factory() as session:
            yield session
        await _truncate_hana_test_tables(engine)


@pytest_asyncio.fixture
async def test_db():
    from app.config import env_settings
    if not env_settings.hana_test:
        # Original SQLite in-memory path
        engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
        yield factory
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
        await engine.dispose()
    else:
        # HANA path: use shared session-scoped engine, truncate after each test
        engine = _get_hana_engine()
        factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
        yield factory
        await _truncate_hana_test_tables(engine)


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
