from __future__ import annotations
import uuid
from datetime import datetime, timedelta
from sqlalchemy import select, func, update
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
    "resolved_at", "closed_at", "sla_breached", "sla_resolution_due", "sla_paused_at", "updated_at",
})

_OPEN_STATES_EXCL = frozenset({"resolved", "closed"})

_CLOSED_STATES = frozenset({"resolved", "closed"})
_SLA_PAUSED_STATE = "on_hold"


def _sla_due(priority: int, created_at: datetime, sla_targets: dict | None = None) -> datetime:
    if sla_targets is not None:
        hours_val = sla_targets.get(str(priority))
        if hours_val is not None:
            return created_at + timedelta(hours=int(hours_val))
    hours = app_config.priorities[priority].sla_hours
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

    async def mark_overdue_sla_breached(self) -> None:
        now = utcnow()
        await self.session.execute(
            update(Incident)
            .where(
                Incident.sla_breached == False,  # noqa: E712
                Incident.state.notin_(_CLOSED_STATES),
                Incident.state != _SLA_PAUSED_STATE,
                Incident.sla_resolution_due.is_not(None),
                Incident.sla_resolution_due < now,
            )
            .values(sla_breached=True, updated_at=now)
        )

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

    async def update_if_current(
        self,
        incident_id: str,
        expected_updated_at: datetime,
        fields: dict,
    ) -> bool:
        for k in fields:
            if k not in _INCIDENT_UPDATABLE:
                raise ValueError(f"Field '{k}' is not updatable")
        result = await self.session.execute(
            update(Incident)
            .where(
                Incident.id == incident_id,
                Incident.updated_at == expected_updated_at,
            )
            .values(**fields)
        )
        return result.rowcount == 1

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

    async def list_auto_escalation_candidates(self, limit: int = 200) -> list[Incident]:
        result = await self.session.execute(
            select(Incident)
            .where(
                Incident.sla_breached == True,  # noqa: E712
                Incident.state.notin_(_CLOSED_STATES),
                Incident.priority > 0,
            )
            .order_by(Incident.updated_at.asc())
            .limit(limit)
        )
        return list(result.scalars().all())

    async def get_ops_kpis(self, days: int) -> dict:
        now = utcnow()
        since = now - timedelta(days=days)

        resolved_rows = (
            await self.session.execute(
                select(Incident.created_at, Incident.resolved_at).where(
                    Incident.resolved_at.is_not(None),
                    Incident.resolved_at >= since,
                )
            )
        ).all()
        durations_hours: list[float] = []
        for row in resolved_rows:
            if row.created_at is None or row.resolved_at is None:
                continue
            durations_hours.append((row.resolved_at - row.created_at).total_seconds() / 3600.0)
        avg_resolution_hours = (
            sum(durations_hours) / len(durations_hours) if durations_hours else 0.0
        )

        reopened = (
            await self.session.execute(
                select(func.count()).select_from(Incident).where(
                    Incident.resolved_at.is_not(None),
                    Incident.state.in_(("in_progress", "assigned", "on_hold")),
                    Incident.updated_at >= since,
                )
            )
        ).scalar_one()

        overdue_open = (
            await self.session.execute(
                select(func.count()).select_from(Incident).where(
                    Incident.sla_breached == True,  # noqa: E712
                    Incident.state.notin_(_CLOSED_STATES),
                )
            )
        ).scalar_one()

        return {
            "avg_resolution_hours": round(float(avg_resolution_hours), 2),
            "reopened": reopened,
            "overdue_open": overdue_open,
        }

    # ── AI / Analytics ────────────────────────────────────────────────────────

    async def get_sla_risk_incidents(self) -> list[Incident]:
        result = await self.session.execute(
            select(Incident)
            .where(
                Incident.state.notin_(_CLOSED_STATES),
                Incident.sla_resolution_due.isnot(None),
            )
            .order_by(Incident.sla_resolution_due.asc())
            .limit(50)
        )
        return list(result.scalars().all())

    async def get_recent_incidents_for_analytics(self, hours: int = 168) -> list[Incident]:
        since = utcnow() - timedelta(hours=hours)
        result = await self.session.execute(
            select(Incident).where(Incident.created_at >= since)
        )
        return list(result.scalars().all())

    async def get_resolved_for_agent_stats(self, days: int = 30):
        since = utcnow() - timedelta(days=days)
        return (await self.session.execute(
            select(
                Incident.assignee_id,
                Incident.category,
                Incident.created_at,
                Incident.resolved_at,
            ).where(
                Incident.state.in_(list(_CLOSED_STATES)),
                Incident.resolved_at.isnot(None),
                Incident.assignee_id.isnot(None),
                Incident.created_at >= since,
            )
        )).all()

    async def get_agent_open_counts(self):
        return (await self.session.execute(
            select(Incident.assignee_id, func.count(Incident.id).label("count"))
            .where(
                Incident.state.notin_(_CLOSED_STATES),
                Incident.assignee_id.isnot(None),
            )
            .group_by(Incident.assignee_id)
        )).all()

    async def get_recent_resolved_with_notes(self, limit: int = 30) -> list[Incident]:
        result = await self.session.execute(
            select(Incident)
            .where(
                Incident.state.in_(list(_CLOSED_STATES)),
                Incident.resolution_notes.isnot(None),
            )
            .order_by(Incident.resolved_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())

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
