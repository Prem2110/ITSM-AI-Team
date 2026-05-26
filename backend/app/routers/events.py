from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from ..db import get_db
from ..auth.permissions import require_scope
from ..auth.context import CallerContext
from ..repositories.incident_repository import IncidentRepository
from ..repositories.incident_event_repository import IncidentEventRepository
from ..schemas.incident_event import IncidentEventCreate, IncidentEventResponse, EventCreateRequest

router = APIRouter(prefix="/api/incidents/{incident_id}/events", tags=["events"])


@router.get("")
async def list_events(
    incident_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    caller: CallerContext = require_scope("TicketRead"),
    session: AsyncSession = Depends(get_db),
) -> dict:
    incident = await IncidentRepository(session).get_by_id(incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    repo = IncidentEventRepository(session)
    offset = (page - 1) * page_size
    events = await repo.list_for_incident(incident_id, limit=page_size, offset=offset, order="desc")
    total = await repo.count_for_incident(incident_id)
    return {
        "items": [IncidentEventResponse.model_validate(e) for e in events],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.post("", response_model=IncidentEventResponse, status_code=201)
async def create_event(
    incident_id: str,
    req: EventCreateRequest,
    caller: CallerContext = require_scope("TicketWrite"),
    session: AsyncSession = Depends(get_db),
):
    incident = await IncidentRepository(session).get_by_id(incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    if req.event_type == "work_note" and "Agent" not in caller.scopes:
        raise HTTPException(status_code=403, detail="work_note requires Agent scope")
    repo = IncidentEventRepository(session)
    event = await repo.create(IncidentEventCreate(
        incident_id=incident_id,
        actor_id=caller.user_id,
        event_type=req.event_type,
        body=req.body,
        event_metadata=None,
    ))
    return IncidentEventResponse.model_validate(event)
