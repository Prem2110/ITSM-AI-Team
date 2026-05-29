from __future__ import annotations
import uuid
from datetime import datetime, timedelta
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from ..models.incident import Incident
from ..schemas.incident import IncidentCreate
from ..config import app_config
from ..services.numbering import next_incident_number
from ..utils import utcnow

_INCIDENT_UPDATABLE = frozenset({
    "title", "description", "priority", "category", "assignee_id",
    "state", "resolution_code", "resolution_notes",
    "resolved_at", "closed_at", "sla_breached", "sla_resolution_due", "updated_at",
})

_OPEN_STATES_EXCL = frozenset({"resolved", "closed"})

_CLOSED_STATES = frozenset({"resolved", "closed"})


def _sla_due(priority: int, created_at: datetime, sla_targets: dict | None = None) -> datetime:
    if sla_targets is not None:
        hours_val = sla_targets.get(str(priority))
        if hours_val is not None:
            return created_at + timedelta(hours=int(hours_val))
    hours = app_config.priorities[priority - 1].sla_hours
    return created_at + timedelta(hours=hours)


class IncidentRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(self, data: IncidentCreate, sla_targets: dict | None = None) -> Incident:
        now = utcnow()
        number = await next_incident_number(self.session)
        incident = Incident(
            id=str(uuid.uuid4()),
            number=number,
            title=data.title,
            description=data.description,
            state="new",
            priority=data.priority,
            category=data.category,
            source=data.source,
            requester_id=data.requester_id,
            assignee_id=data.assignee_id,
            sla_resolution_due=_sla_due(data.priority, now, sla_targets),
            sla_breached=False,
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

    async def get_with_attachments(self, incident_id: str) -> Incident | None:
        result = await self.session.execute(
            select(Incident)
            .options(selectinload(Incident.attachments))
            .where(Incident.id == incident_id)
        )
        return result.scalar_one_or_none()

    async def list(
        self,
        state: str | None = None,
        priority: int | None = None,
        assignee_id: str | None = None,
        requester_id: str | None = None,
        q: str | None = None,
        category: str | None = None,
        sla_breached: bool | None = None,
        sort: str = "created_at",
        order: str = "desc",
        limit: int = 50,
        offset: int = 0,
    ) -> list[Incident]:
        query = select(Incident).options(selectinload(Incident.assignee))
        if state is not None:
            query = query.where(Incident.state == state)
        if priority is not None:
            query = query.where(Incident.priority == priority)
        if assignee_id == "unassigned":
            query = query.where(Incident.assignee_id.is_(None))
        elif assignee_id is not None:
            query = query.where(Incident.assignee_id == assignee_id)
        if requester_id is not None:
            query = query.where(Incident.requester_id == requester_id)
        if q is not None:
            query = query.where(Incident.title.ilike(f"%{q}%"))
        if category is not None:
            query = query.where(Incident.category == category)
        if sla_breached is not None:
            query = query.where(Incident.sla_breached == sla_breached)  # noqa: E712
        sort_col = {
            "created_at": Incident.created_at,
            "updated_at": Incident.updated_at,
            "priority": Incident.priority,
            "number": Incident.number,
        }.get(sort, Incident.created_at)
        query = query.order_by(sort_col.asc() if order == "asc" else sort_col.desc())
        query = query.limit(limit).offset(offset)
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def count(
        self,
        state: str | None = None,
        priority: int | None = None,
        assignee_id: str | None = None,
        requester_id: str | None = None,
        q: str | None = None,
        category: str | None = None,
        sla_breached: bool | None = None,
    ) -> int:
        query = select(func.count()).select_from(Incident)
        if state is not None:
            query = query.where(Incident.state == state)
        if priority is not None:
            query = query.where(Incident.priority == priority)
        if assignee_id == "unassigned":
            query = query.where(Incident.assignee_id.is_(None))
        elif assignee_id is not None:
            query = query.where(Incident.assignee_id == assignee_id)
        if requester_id is not None:
            query = query.where(Incident.requester_id == requester_id)
        if q is not None:
            query = query.where(Incident.title.ilike(f"%{q}%"))
        if category is not None:
            query = query.where(Incident.category == category)
        if sla_breached is not None:
            query = query.where(Incident.sla_breached == sla_breached)  # noqa: E712
        result = await self.session.execute(query)
        return result.scalar_one()

    async def update(self, incident_id: str, fields: dict) -> Incident | None:
        incident = await self.get_by_id(incident_id)
        if incident is None:
            return None
        for k, v in fields.items():
            if k not in _INCIDENT_UPDATABLE:
                raise ValueError(f"Field '{k}' is not updatable")
            setattr(incident, k, v)
        return incident

    async def get_dashboard_summary(self, caller_user_id: str) -> dict:
        my_open = (await self.session.execute(
            select(func.count()).select_from(Incident).where(
                Incident.assignee_id == caller_user_id,
                Incident.state.notin_(_CLOSED_STATES),
            )
        )).scalar_one()

        all_open = (await self.session.execute(
            select(func.count()).select_from(Incident).where(
                Incident.state.notin_(_CLOSED_STATES)
            )
        )).scalar_one()

        unassigned = (await self.session.execute(
            select(func.count()).select_from(Incident).where(
                Incident.assignee_id.is_(None),
                Incident.state.notin_(_CLOSED_STATES),
            )
        )).scalar_one()

        breached = (await self.session.execute(
            select(func.count()).select_from(Incident).where(
                Incident.sla_breached == True,  # noqa: E712
                Incident.state.notin_(_CLOSED_STATES),
            )
        )).scalar_one()

        by_state_rows = (await self.session.execute(
            select(Incident.state, func.count().label("cnt"))
            .where(Incident.state.notin_(_CLOSED_STATES))
            .group_by(Incident.state)
        )).all()
        by_state = {row.state: row.cnt for row in by_state_rows}

        by_priority_rows = (await self.session.execute(
            select(Incident.priority, func.count().label("cnt"))
            .where(Incident.state.notin_(_CLOSED_STATES))
            .group_by(Incident.priority)
            .order_by(Incident.priority)
        )).all()
        by_priority = {row.priority: row.cnt for row in by_priority_rows}

        return {
            "my_open": my_open,
            "all_open": all_open,
            "unassigned": unassigned,
            "breached": breached,
            "by_state": by_state,
            "by_priority": by_priority,
        }

    async def get_trends(self, days: int) -> dict:
        now = utcnow()
        since = now - timedelta(days=days)

        created_rows = (await self.session.execute(
            select(Incident.created_at).where(Incident.created_at >= since)
        )).scalars().all()

        resolved_rows = (await self.session.execute(
            select(Incident.resolved_at).where(
                Incident.resolved_at.isnot(None),
                Incident.resolved_at >= since,
            )
        )).scalars().all()

        # range(1, days+1) so the last date is today (since + days = now)
        dates = [(since + timedelta(days=i)).strftime('%Y-%m-%d') for i in range(1, days + 1)]
        new_map: dict[str, int] = {d: 0 for d in dates}
        res_map: dict[str, int] = {d: 0 for d in dates}

        for dt in created_rows:
            d = dt.strftime('%Y-%m-%d')
            if d in new_map:
                new_map[d] += 1

        for dt in resolved_rows:
            d = dt.strftime('%Y-%m-%d')
            if d in res_map:
                res_map[d] += 1

        return {
            "dates": dates,
            "new_counts": [new_map[d] for d in dates],
            "resolved_counts": [res_map[d] for d in dates],
        }

    async def get_sla_compliance(self, days: int) -> dict:
        now = utcnow()
        since = now - timedelta(days=days)

        rows = (await self.session.execute(
            select(Incident.resolved_at, Incident.sla_resolution_due).where(
                Incident.resolved_at.isnot(None),
                Incident.resolved_at >= since,
            )
        )).all()

        total = len(rows)
        if total == 0:
            return {"compliance_pct": 0.0, "met": 0, "total": 0}

        met = sum(
            1 for row in rows
            if row.sla_resolution_due is not None and row.resolved_at <= row.sla_resolution_due
        )
        return {
            "compliance_pct": round(met / total * 100, 1),
            "met": met,
            "total": total,
        }

    async def get_top_categories(self, days: int, limit: int) -> list[dict]:
        now = utcnow()
        since = now - timedelta(days=days)

        rows = (await self.session.execute(
            select(Incident.category, func.count().label("cnt"))
            .where(Incident.created_at >= since)
            .group_by(Incident.category)
            .order_by(func.count().desc())
            .limit(limit)
        )).all()

        return [{"category": row.category, "count": row.cnt} for row in rows]
