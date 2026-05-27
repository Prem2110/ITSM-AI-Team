from __future__ import annotations
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from ..repositories.incident_repository import IncidentRepository, _sla_due
from ..repositories.incident_event_repository import IncidentEventRepository
from ..repositories.user_repository import UserRepository
from ..repositories.app_settings_repository import AppSettingsRepository
from ..schemas.incident import (
    IncidentCreate, IncidentCreateRequest, IncidentPatchRequest,
    TransitionRequest, IncidentDetail,
)
from ..schemas.incident_event import IncidentEventCreate
from ..schemas.user import UserResponse
from ..schemas.incident_event import IncidentEventResponse
from ..state_machine import validate_transition
from ..utils import utcnow
from ..auth.context import CallerContext

_DEFAULT_RESOLUTION_CODES = [
    "Fixed", "Workaround", "No Fault Found", "User Error", "Duplicate", "Cannot Reproduce"
]


class IncidentService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self._inc = IncidentRepository(session)
        self._evt = IncidentEventRepository(session)
        self._usr = UserRepository(session)

    async def _get_sla_targets(self) -> dict | None:
        settings = await AppSettingsRepository(self.session).get()
        return settings.sla_targets if settings else None

    async def create_incident(self, req: IncidentCreateRequest, caller: CallerContext):
        sla_targets = await self._get_sla_targets()
        requester_id = req.requester_id or caller.user_id
        create_data = IncidentCreate(
            title=req.title,
            description=req.description,
            priority=req.priority,
            category=req.category,
            source=req.source,
            requester_id=requester_id,
            assignee_id=req.assignee_id,
        )
        incident = await self._inc.create(create_data, sla_targets)
        await self._evt.create(IncidentEventCreate(
            incident_id=incident.id,
            actor_id=caller.user_id,
            event_type="field_update",
            body=None,
            event_metadata={"action": "created", "title": req.title},
        ))
        return incident

    async def update_incident(
        self, incident_id: str, req: IncidentPatchRequest, caller: CallerContext
    ):
        incident = await self._inc.get_by_id(incident_id)
        if incident is None:
            raise HTTPException(status_code=404, detail="Incident not found")

        fields = req.model_dump(exclude_none=True)
        if not fields:
            return incident

        changed: dict = {}
        for k, v in fields.items():
            old = getattr(incident, k)
            if old != v:
                changed[k] = {"old": old, "new": v}

        if not changed:
            return incident

        if "priority" in changed:
            sla_targets = await self._get_sla_targets()
            fields["sla_resolution_due"] = _sla_due(fields["priority"], incident.created_at, sla_targets)

        fields["updated_at"] = utcnow()
        await self._inc.update(incident_id, fields)

        for field_name, vals in changed.items():
            await self._evt.create(IncidentEventCreate(
                incident_id=incident_id,
                actor_id=caller.user_id,
                event_type="field_update",
                body=None,
                event_metadata={
                    "field": field_name,
                    "old": str(vals["old"]),
                    "new": str(vals["new"]),
                },
            ))

        return incident

    async def transition_incident(
        self, incident_id: str, req: TransitionRequest, caller: CallerContext
    ):
        incident = await self._inc.get_by_id(incident_id)
        if incident is None:
            raise HTTPException(status_code=404, detail="Incident not found")

        is_agent = "Agent" in caller.scopes
        if not is_agent:
            if (incident.state, req.to_state) != ("resolved", "closed"):
                raise HTTPException(
                    status_code=403,
                    detail="Requesters may only close a resolved ticket.",
                )
            if incident.requester_id != caller.user_id:
                raise HTTPException(
                    status_code=403,
                    detail="You can only close your own tickets.",
                )

        # Merge existing resolution fields with incoming so validate_transition sees them
        merged: dict = {}
        if incident.resolution_code:
            merged["resolution_code"] = incident.resolution_code
        if incident.resolution_notes:
            merged["resolution_notes"] = incident.resolution_notes
        if req.resolution_code:
            merged["resolution_code"] = req.resolution_code
        if req.resolution_notes:
            merged["resolution_notes"] = req.resolution_notes

        try:
            validate_transition(incident.state, req.to_state, merged)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

        if req.to_state == "resolved":
            settings = await AppSettingsRepository(self.session).get()
            allowed_codes = (
                settings.resolution_codes
                if settings and settings.resolution_codes
                else _DEFAULT_RESOLUTION_CODES
            )
            code = merged.get("resolution_code", "")
            if code not in allowed_codes:
                raise HTTPException(
                    status_code=422,
                    detail=f"resolution_code must be one of: {', '.join(allowed_codes)}",
                )

        from_state = incident.state
        now = utcnow()
        update_fields: dict = {"state": req.to_state, "updated_at": now}
        if req.resolution_code:
            update_fields["resolution_code"] = req.resolution_code
        if req.resolution_notes:
            update_fields["resolution_notes"] = req.resolution_notes
        if req.to_state == "resolved":
            update_fields["resolved_at"] = now
        if req.to_state == "closed":
            update_fields["closed_at"] = now

        await self._inc.update(incident_id, update_fields)

        await self._evt.create(IncidentEventCreate(
            incident_id=incident_id,
            actor_id=caller.user_id,
            event_type="state_change",
            body=None,
            event_metadata={
                "from_state": from_state,
                "to_state": req.to_state,
                "resolution_code": merged.get("resolution_code"),
            },
        ))

        return await self._inc.get_by_id(incident_id)

    async def get_incident_detail(self, incident_id: str) -> IncidentDetail:
        incident = await self._inc.get_with_events(incident_id)
        if incident is None:
            raise HTTPException(status_code=404, detail="Incident not found")

        requester = await self._usr.get_by_id(incident.requester_id)
        assignee = (
            await self._usr.get_by_id(incident.assignee_id)
            if incident.assignee_id else None
        )

        events = sorted(incident.events, key=lambda e: e.created_at)[-50:]

        return IncidentDetail(
            id=incident.id,
            number=incident.number,
            title=incident.title,
            description=incident.description,
            state=incident.state,
            priority=incident.priority,
            category=incident.category,
            source=incident.source,
            requester_id=incident.requester_id,
            assignee_id=incident.assignee_id,
            resolution_code=incident.resolution_code,
            resolution_notes=incident.resolution_notes,
            sla_resolution_due=incident.sla_resolution_due,
            sla_breached=incident.sla_breached,
            created_at=incident.created_at,
            updated_at=incident.updated_at,
            resolved_at=incident.resolved_at,
            closed_at=incident.closed_at,
            requester=UserResponse.model_validate(requester),
            assignee=UserResponse.model_validate(assignee) if assignee else None,
            events=[IncidentEventResponse.model_validate(e) for e in events],
        )

    async def check_and_update_sla_breach(self, incident) -> None:
        if incident.sla_breached:
            return
        if incident.state in ("resolved", "closed"):
            return
        if incident.sla_resolution_due is None:
            return
        # SQLite returns naive datetimes; strip tz for safe comparison
        due = incident.sla_resolution_due
        now = utcnow()
        due_naive = due.replace(tzinfo=None) if due.tzinfo is not None else due
        now_naive = now.replace(tzinfo=None) if now.tzinfo is not None else now
        if due_naive < now_naive:
            await self._inc.update(incident.id, {
                "sla_breached": True,
                "updated_at": utcnow(),
            })
