from __future__ import annotations
from fastapi import Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from ..db import get_db
from ..config import env_settings
from .context import CallerContext


async def get_caller(
    request: Request,
    session: AsyncSession = Depends(get_db),
) -> CallerContext:
    if env_settings.auth_mode == "fake":
        from .fake import get_caller_fake
        return await get_caller_fake(request, session)
    from .xsuaa import get_caller_xsuaa
    return await get_caller_xsuaa(request, session)


def require_scope(*required_scopes: str):
    async def _check(caller: CallerContext = Depends(get_caller)) -> CallerContext:
        missing = [s for s in required_scopes if s not in caller.scopes]
        if missing:
            raise HTTPException(status_code=403, detail=f"Missing scopes: {missing}")
        return caller
    return Depends(_check)
