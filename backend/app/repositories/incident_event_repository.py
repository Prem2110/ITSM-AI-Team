from __future__ import annotations
import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from ..models.incident_event import IncidentEvent
from ..schemas.incident_event import IncidentEventCreate


class IncidentEventRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(self, data: IncidentEventCreate) -> IncidentEvent:
        event = IncidentEvent(
            id=str(uuid.uuid4()),
            incident_id=data.incident_id,
            actor_id=data.actor_id,
            event_type=data.event_type,
            body=data.body,
            event_metadata=data.event_metadata,
        )
        self.session.add(event)
        return event

    async def list_for_incident(self, incident_id: str) -> list[IncidentEvent]:
        result = await self.session.execute(
            select(IncidentEvent)
            .where(IncidentEvent.incident_id == incident_id)
            .order_by(IncidentEvent.created_at.asc())
        )
        return list(result.scalars().all())
