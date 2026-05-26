from __future__ import annotations
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from ..db import get_db
from ..auth.permissions import require_scope
from ..auth.context import CallerContext
from ..repositories.user_repository import UserRepository
from ..schemas.user import UserResponse

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("", response_model=list[UserResponse])
async def list_users(
    role: str | None = Query(None),
    caller: CallerContext = require_scope("Agent"),
    session: AsyncSession = Depends(get_db),
):
    repo = UserRepository(session)
    users = await repo.list_by_role(role) if role else await repo.list_active()
    return [UserResponse.model_validate(u) for u in users]
