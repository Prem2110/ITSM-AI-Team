from __future__ import annotations
from fastapi import APIRouter
from ..auth.permissions import require_scope
from ..auth.context import CallerContext

router = APIRouter(prefix="/api", tags=["session"])


@router.get("/me")
async def get_me(caller: CallerContext = require_scope("TicketRead")) -> dict:
    return {
        "user_id": caller.user_id,
        "email": caller.email,
        "name": caller.name,
        "scopes": caller.scopes,
    }
