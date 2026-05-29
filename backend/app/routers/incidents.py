from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from ..db import get_db
from ..auth.permissions import require_scope
from ..auth.context import CallerContext
from ..repositories.incident_repository import IncidentRepository
from ..schemas.incident import (
    IncidentCreateRequest, IncidentPatchRequest, TransitionRequest,
    IncidentResponse, IncidentListResponse, IncidentListItem, IncidentDetail,
)
from ..services.incident_service import IncidentService

router = APIRouter(prefix="/api/incidents", tags=["incidents"])


@router.get("", response_model=IncidentListResponse)
async def list_incidents(
    state: str | None = Query(None),
    priority: int | None = Query(None),
    assignee_id: str | None = Query(None),
    requester_id: str | None = Query(None),
    q: str | None = Query(None),
    category: str | None = Query(None),
    sla_breached: bool | None = Query(None),
    sort: str = Query("created_at"),
    order: str = Query("desc"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    caller: CallerContext = require_scope("TicketRead"),
    session: AsyncSession = Depends(get_db),
):
    repo = IncidentRepository(session)
    svc = IncidentService(session)
    offset = (page - 1) * page_size
    items = await repo.list(
        state=state, priority=priority, assignee_id=assignee_id,
        requester_id=requester_id, q=q, category=category,
        sla_breached=sla_breached,
        sort=sort, order=order, limit=page_size, offset=offset,
    )
    total = await repo.count(
        state=state, priority=priority, assignee_id=assignee_id,
        requester_id=requester_id, q=q, category=category,
        sla_breached=sla_breached,
    )
    for inc in items:
        await svc.check_and_update_sla_breach(inc)
    return IncidentListResponse(
        items=[
            IncidentListItem(
                id=i.id,
                number=i.number,
                title=i.title,
                state=i.state,
                priority=i.priority,
                category=i.category,
                assignee_id=i.assignee_id,
                assignee_name=i.assignee.name if i.assignee else None,
                sla_breached=i.sla_breached,
                created_at=i.created_at,
                updated_at=i.updated_at,
            )
            for i in items
        ],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=IncidentResponse, status_code=201)
async def create_incident(
    req: IncidentCreateRequest,
    caller: CallerContext = require_scope("TicketWrite"),
    session: AsyncSession = Depends(get_db),
):
    svc = IncidentService(session)
    incident = await svc.create_incident(req, caller)
    return IncidentResponse.model_validate(incident)


@router.get("/{incident_id}", response_model=IncidentDetail)
async def get_incident(
    incident_id: str,
    caller: CallerContext = require_scope("TicketRead"),
    session: AsyncSession = Depends(get_db),
):
    repo = IncidentRepository(session)
    svc = IncidentService(session)
    incident = await repo.get_by_id(incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    await svc.check_and_update_sla_breach(incident)
    return await svc.get_incident_detail(incident_id)


@router.patch("/{incident_id}", response_model=IncidentResponse)
async def patch_incident(
    incident_id: str,
    req: IncidentPatchRequest,
    caller: CallerContext = require_scope("Agent"),
    session: AsyncSession = Depends(get_db),
):
    svc = IncidentService(session)
    incident = await svc.update_incident(incident_id, req, caller)
    return IncidentResponse.model_validate(incident)


@router.post("/{incident_id}/transition", response_model=IncidentResponse)
async def transition_incident(
    incident_id: str,
    req: TransitionRequest,
    caller: CallerContext = require_scope("TicketWrite"),
    session: AsyncSession = Depends(get_db),
):
    svc = IncidentService(session)
    incident = await svc.transition_incident(incident_id, req, caller)
    return IncidentResponse.model_validate(incident)
