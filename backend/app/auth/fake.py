from __future__ import annotations
import logging
from fastapi import Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from ..db import get_db
from ..repositories.user_repository import UserRepository
from .context import CallerContext

logger = logging.getLogger(__name__)

_ROLE_SCOPES: dict[str, list[str]] = {
    "requester": ["TicketRead", "TicketWrite"],
    "agent": ["TicketRead", "TicketWrite", "Agent"],
    "admin": ["TicketRead", "TicketWrite", "Agent", "Admin"],
}


async def get_caller_fake(
    request: Request,
    session: AsyncSession = Depends(get_db),
) -> CallerContext:
    email = request.headers.get("X-Fake-User")
    if not email:
        logger.warning("auth.fake: missing X-Fake-User header — %s %s", request.method, request.url.path)
        raise HTTPException(status_code=401, detail="X-Fake-User header required")
    user = await UserRepository(session).get_by_email(email)
    if user is None:
        logger.warning("auth.fake: unknown user email=%r — %s %s", email, request.method, request.url.path)
        raise HTTPException(status_code=401, detail="Unknown fake user")
    scopes = _ROLE_SCOPES.get(user.role, [])
    logger.debug("auth.fake: authenticated email=%r role=%s scopes=%s", user.email, user.role, scopes)
    return CallerContext(
        user_id=user.id,
        email=user.email,
        name=user.name,
        scopes=scopes,
    )
