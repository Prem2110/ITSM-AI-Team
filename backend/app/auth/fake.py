from __future__ import annotations
from fastapi import Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from ..db import get_db
from ..repositories.user_repository import UserRepository
from .context import CallerContext

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
        raise HTTPException(status_code=401, detail="X-Fake-User header required")
    user = await UserRepository(session).get_by_email(email)
    if user is None:
        raise HTTPException(status_code=401, detail="Unknown fake user")
    return CallerContext(
        user_id=user.id,
        email=user.email,
        name=user.name,
        scopes=_ROLE_SCOPES.get(user.role, []),
    )
