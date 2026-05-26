from __future__ import annotations
import uuid
from datetime import timedelta
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from ..models.incident import Incident
from ..schemas.incident import IncidentCreate
from ..config import app_config
from ..services.numbering import next_incident_number
from ..utils import utcnow


def _sla_due(priority: int, created_at) -> object:
    hours = app_config.priorities[priority - 1].sla_hours
    return created_at + timedelta(hours=hours)


class IncidentRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(self, data: IncidentCreate) -> Incident:
        now = utcnow()
        number = await next_incident_number(self.session)
        incident = Incident(
            id=str(uuid.uuid4()),
            number=number,
            title=data.title,
            description=data.description,
            state=data.state,
            priority=data.priority,
            category=data.category,
            source=data.source,
            requester_id=data.requester_id,
            assignee_id=data.assignee_id,
            sla_resolution_due=_sla_due(data.priority, now),
            created_at=now,
            updated_at=now,
        )
        self.session.add(incident)
        return incident

    async def get_by_id(self, incident_id: str) -> Incident | None:
        result = await self.session.execute(
            select(Incident).where(Incident.id == incident_id)
        )
        return result.scalar_one_or_none()

    async def get_by_number(self, number: str) -> Incident | None:
        result = await self.session.execute(
            select(Incident).where(Incident.number == number)
        )
        return result.scalar_one_or_none()

    async def get_with_events(self, incident_id: str) -> Incident | None:
        result = await self.session.execute(
            select(Incident)
            .options(selectinload(Incident.events))
            .where(Incident.id == incident_id)
        )
        return result.scalar_one_or_none()

    async def list(
        self,
        state: str | None = None,
        priority: int | None = None,
        assignee_id: str | None = None,
        requester_id: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[Incident]:
        q = select(Incident)
        if state is not None:
            q = q.where(Incident.state == state)
        if priority is not None:
            q = q.where(Incident.priority == priority)
        if assignee_id is not None:
            q = q.where(Incident.assignee_id == assignee_id)
        if requester_id is not None:
            q = q.where(Incident.requester_id == requester_id)
        q = q.order_by(Incident.created_at.desc()).limit(limit).offset(offset)
        result = await self.session.execute(q)
        return list(result.scalars().all())

    async def update(self, incident_id: str, fields: dict) -> Incident | None:
        incident = await self.get_by_id(incident_id)
        if incident is None:
            return None
        for k, v in fields.items():
            setattr(incident, k, v)
        incident.updated_at = utcnow()
        return incident
