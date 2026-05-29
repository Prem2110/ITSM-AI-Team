from __future__ import annotations
from fastapi import APIRouter, Depends, Query
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


@router.get("/trends")
async def get_trends(
    days: int = Query(14, ge=1, le=365),
    caller: CallerContext = require_scope("TicketRead"),
    session: AsyncSession = Depends(get_db),
) -> dict:
    return await IncidentRepository(session).get_trends(days)


@router.get("/sla_compliance")
async def get_sla_compliance(
    days: int = Query(30, ge=1, le=365),
    caller: CallerContext = require_scope("TicketRead"),
    session: AsyncSession = Depends(get_db),
) -> dict:
    return await IncidentRepository(session).get_sla_compliance(days)


@router.get("/top_categories")
async def get_top_categories(
    days: int = Query(30, ge=1, le=365),
    limit: int = Query(5, ge=1, le=20),
    caller: CallerContext = require_scope("TicketRead"),
    session: AsyncSession = Depends(get_db),
) -> list:
    return await IncidentRepository(session).get_top_categories(days, limit)
