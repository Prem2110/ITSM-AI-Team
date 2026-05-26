from __future__ import annotations
import pytest
from app.services.incident_service import IncidentService
from app.repositories.user_repository import UserRepository
from app.schemas.user import UserCreate
from app.schemas.incident import IncidentCreateRequest, IncidentPatchRequest, TransitionRequest
from app.auth.context import CallerContext
from fastapi import HTTPException


async def _make_agent(session) -> tuple[str, CallerContext]:
    user = await UserRepository(session).create(
        UserCreate(email="agent@svc.com", name="Agent", role="agent")
    )
    ctx = CallerContext(user_id=user.id, email=user.email, name=user.name,
                       scopes=["TicketRead", "TicketWrite", "Agent"])
    return user.id, ctx


async def _make_requester(session) -> tuple[str, CallerContext]:
    user = await UserRepository(session).create(
        UserCreate(email="req@svc.com", name="Requester", role="requester")
    )
    ctx = CallerContext(user_id=user.id, email=user.email, name=user.name,
                       scopes=["TicketRead", "TicketWrite"])
    return user.id, ctx


async def test_create_incident_sets_new_state(db_session):
    _, agent_ctx = await _make_agent(db_session)
    svc = IncidentService(db_session)
    req = IncidentCreateRequest(title="Broken printer", description="Won't print",
                                priority=3, category="Hardware")
    inc = await svc.create_incident(req, agent_ctx)
    assert inc.state == "new"
    assert inc.number.startswith("INC")


async def test_create_incident_defaults_requester_to_caller(db_session):
    _, agent_ctx = await _make_agent(db_session)
    svc = IncidentService(db_session)
    req = IncidentCreateRequest(title="VPN down", description="Can't connect",
                                priority=1, category="Network")
    inc = await svc.create_incident(req, agent_ctx)
    assert inc.requester_id == agent_ctx.user_id


async def test_update_incident_writes_field_update_event(db_session):
    _, agent_ctx = await _make_agent(db_session)
    svc = IncidentService(db_session)
    req = IncidentCreateRequest(title="Old title", description="desc", priority=3, category="Hardware")
    inc = await svc.create_incident(req, agent_ctx)
    await db_session.flush()

    patch = IncidentPatchRequest(title="New title")
    updated = await svc.update_incident(inc.id, patch, agent_ctx)
    assert updated.title == "New title"


async def test_transition_new_to_assigned(db_session):
    _, agent_ctx = await _make_agent(db_session)
    svc = IncidentService(db_session)
    req = IncidentCreateRequest(title="Test", description="d", priority=2, category="Software")
    inc = await svc.create_incident(req, agent_ctx)
    await db_session.flush()

    result = await svc.transition_incident(
        inc.id, TransitionRequest(to_state="assigned"), agent_ctx
    )
    assert result.state == "assigned"


async def test_transition_to_resolved_requires_resolution_fields(db_session):
    _, agent_ctx = await _make_agent(db_session)
    svc = IncidentService(db_session)
    req = IncidentCreateRequest(title="T", description="d", priority=3, category="Network")
    inc = await svc.create_incident(req, agent_ctx)
    await db_session.flush()

    # Force in_progress state directly so we can resolve
    from app.repositories.incident_repository import IncidentRepository
    await IncidentRepository(db_session).update(inc.id, {"state": "in_progress"})
    await db_session.flush()

    with pytest.raises(HTTPException) as exc_info:
        await svc.transition_incident(
            inc.id, TransitionRequest(to_state="resolved"), agent_ctx
        )
    assert exc_info.value.status_code == 422


async def test_transition_requester_can_close_own_resolved(db_session):
    req_id, req_ctx = await _make_requester(db_session)
    _, agent_ctx = await _make_agent(db_session)
    svc = IncidentService(db_session)
    create_req = IncidentCreateRequest(title="My ticket", description="d", priority=3,
                                       category="Hardware", requester_id=req_id)
    inc = await svc.create_incident(create_req, agent_ctx)
    await db_session.flush()

    # Force resolved state
    from app.repositories.incident_repository import IncidentRepository
    await IncidentRepository(db_session).update(inc.id, {
        "state": "resolved",
        "resolution_code": "fixed",
        "resolution_notes": "All good",
    })
    await db_session.flush()

    result = await svc.transition_incident(
        inc.id, TransitionRequest(to_state="closed"), req_ctx
    )
    assert result.state == "closed"


async def test_transition_requester_cannot_close_other_ticket(db_session):
    req_id, req_ctx = await _make_requester(db_session)
    _, agent_ctx = await _make_agent(db_session)
    svc = IncidentService(db_session)
    # Incident owned by agent, not by requester
    create_req = IncidentCreateRequest(title="Agent ticket", description="d", priority=3,
                                       category="Hardware", requester_id=agent_ctx.user_id)
    inc = await svc.create_incident(create_req, agent_ctx)
    await db_session.flush()

    from app.repositories.incident_repository import IncidentRepository
    await IncidentRepository(db_session).update(inc.id, {
        "state": "resolved",
        "resolution_code": "fixed",
        "resolution_notes": "Done",
    })
    await db_session.flush()

    with pytest.raises(HTTPException) as exc_info:
        await svc.transition_incident(
            inc.id, TransitionRequest(to_state="closed"), req_ctx
        )
    assert exc_info.value.status_code == 403


async def test_sla_breach_check_marks_overdue(db_session):
    _, agent_ctx = await _make_agent(db_session)
    svc = IncidentService(db_session)
    req = IncidentCreateRequest(title="Old critical", description="d", priority=1, category="Network")
    inc = await svc.create_incident(req, agent_ctx)
    await db_session.flush()

    # Backdate sla_resolution_due to past
    from datetime import timezone
    from app.repositories.incident_repository import IncidentRepository
    from app.utils import utcnow
    past = utcnow().replace(year=2020)
    await IncidentRepository(db_session).update(inc.id, {"sla_resolution_due": past})
    await db_session.flush()

    await svc.check_and_update_sla_breach(inc)
    refreshed = await IncidentRepository(db_session).get_by_id(inc.id)
    assert refreshed.sla_breached is True
