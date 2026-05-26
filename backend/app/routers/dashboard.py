from __future__ import annotations
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from ..db import get_db
from ..auth.permissions import require_scope
from ..auth.context import CallerContext
from ..repositories.incident_repository import IncidentRepository

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/summary")
async def get_summary(
    caller: CallerContext = require_scope("TicketRead"),
    session: AsyncSession = Depends(get_db),
) -> dict:
    return await IncidentRepository(session).get_dashboard_summary(caller.user_id)
