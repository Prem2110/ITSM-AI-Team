from __future__ import annotations
import uuid
from sqlalchemy import select, func
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

    async def list_for_incident(
        self,
        incident_id: str,
        limit: int = 50,
        offset: int = 0,
        order: str = "desc",
    ) -> list[IncidentEvent]:
        q = select(IncidentEvent).where(IncidentEvent.incident_id == incident_id)
        q = q.order_by(
            IncidentEvent.created_at.asc() if order == "asc"
            else IncidentEvent.created_at.desc()
        )
        q = q.limit(limit).offset(offset)
        result = await self.session.execute(q)
        return list(result.scalars().all())

    async def count_for_incident(self, incident_id: str) -> int:
        result = await self.session.execute(
            select(func.count()).select_from(IncidentEvent).where(
                IncidentEvent.incident_id == incident_id
            )
        )
        return result.scalar_one()
