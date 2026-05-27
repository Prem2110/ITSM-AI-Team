from __future__ import annotations
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from ..db import get_db, AsyncSessionLocal
from ..repositories.app_settings_repository import AppSettingsRepository

_ALLOWED_PREFIXES = ("/api/setup/", "/api/config/", "/api/health", "/health")


class SetupGuardMiddleware(BaseHTTPMiddleware):
    """Block /api/* requests until setup is complete.

    In test mode (get_db is overridden in dependency_overrides), checks the
    test's own DB every request (no caching). In production, caches True once
    setup is confirmed — setup can never be undone.
    """

    def __init__(self, app) -> None:
        super().__init__(app)
        self._done: bool = False

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if self._done:
            return await call_next(request)

        path = request.url.path
        if any(path.startswith(p) for p in _ALLOWED_PREFIXES):
            return await call_next(request)

        override = request.app.dependency_overrides.get(get_db)
        if override is not None:
            # Test mode: check per-test DB without caching
            configured = await _check_with_override(override)
        else:
            # Production mode: check and cache
            try:
                async with AsyncSessionLocal() as session:
                    configured = await AppSettingsRepository(session).get() is not None
            except Exception:
                configured = False
            if configured:
                self._done = True

        if configured:
            return await call_next(request)

        if path.startswith("/api/"):
            return JSONResponse(
                status_code=503,
                content={"detail": "Setup required", "redirect": "/setup"},
            )
        return await call_next(request)


async def _check_with_override(override) -> bool:
    gen = override()
    try:
        session = await gen.__anext__()
        return await AppSettingsRepository(session).get() is not None
    except StopAsyncIteration:
        return False
    finally:
        try:
            await gen.aclose()
        except Exception:
            pass
