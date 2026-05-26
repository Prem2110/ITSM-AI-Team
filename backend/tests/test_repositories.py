from __future__ import annotations
import uuid
import pytest
from datetime import datetime
from tests.conftest import _seed_user
from app.repositories.user_repository import UserRepository
from app.repositories.incident_repository import IncidentRepository
from app.repositories.incident_event_repository import IncidentEventRepository
from app.repositories.attachment_repository import AttachmentRepository
from app.schemas.user import UserCreate
from app.schemas.incident import IncidentCreate
from app.schemas.incident_event import IncidentEventCreate
from app.schemas.attachment import AttachmentCreate


# ---- User Repository ----

async def test_create_and_get_user(db_session):
    repo = UserRepository(db_session)
    user = await repo.create(UserCreate(email="alice@corp.com", name="Alice", role="agent"))
    await db_session.flush()
    fetched = await repo.get_by_id(user.id)
    assert fetched is not None
    assert fetched.email == "alice@corp.com"


async def test_get_user_by_email(db_session):
    repo = UserRepository(db_session)
    await repo.create(UserCreate(email="bob@corp.com", name="Bob", role="requester"))
    await db_session.flush()
    fetched = await repo.get_by_email("bob@corp.com")
    assert fetched is not None
    assert fetched.name == "Bob"


async def test_get_user_not_found_returns_none(db_session):
    repo = UserRepository(db_session)
    result = await repo.get_by_id("nonexistent-id")
    assert result is None


async def test_list_active_users(db_session):
    repo = UserRepository(db_session)
    await repo.create(UserCreate(email="c1@corp.com", name="C1", role="agent"))
    await repo.create(UserCreate(email="c2@corp.com", name="C2", role="admin"))
    await db_session.flush()
    users = await repo.list_active()
    assert len(users) == 2


# ---- Incident Repository ----

async def _make_user(db_session, email="u@c.com"):
    repo = UserRepository(db_session)
    u = await repo.create(UserCreate(email=email, name="User", role="requester"))
    await db_session.flush()
    return u


async def test_create_incident(db_session):
    user = await _make_user(db_session)
    repo = IncidentRepository(db_session)
    inc = await repo.create(IncidentCreate(
        title="Outlook crashes on startup",
        description="Every time I open Outlook it crashes immediately.",
        priority=2,
        category="Software",
        source="web",
        requester_id=user.id,
    ))
    await db_session.flush()
    assert inc.number.startswith("INC")
    assert inc.state == "new"
    assert inc.sla_resolution_due is not None


async def test_get_incident_by_number(db_session):
    user = await _make_user(db_session, "u2@c.com")
    repo = IncidentRepository(db_session)
    inc = await repo.create(IncidentCreate(
        title="VPN not connecting", description="D", priority=1,
        category="Network", source="web", requester_id=user.id
    ))
    await db_session.flush()
    fetched = await repo.get_by_number(inc.number)
    assert fetched is not None
    assert fetched.title == "VPN not connecting"


async def test_list_incidents_by_state(db_session):
    user = await _make_user(db_session, "u3@c.com")
    repo = IncidentRepository(db_session)
    await repo.create(IncidentCreate(
        title="A", description="D", priority=3, category="Hardware",
        source="web", requester_id=user.id
    ))
    await repo.create(IncidentCreate(
        title="B", description="D", priority=2, category="Software",
        source="web", requester_id=user.id
    ))
    await db_session.flush()
    results = await repo.list(state="new")
    assert len(results) == 2


async def test_update_incident(db_session):
    user = await _make_user(db_session, "u4@c.com")
    repo = IncidentRepository(db_session)
    inc = await repo.create(IncidentCreate(
        title="Old title", description="D", priority=3, category="Hardware",
        source="web", requester_id=user.id
    ))
    await db_session.flush()
    updated = await repo.update(inc.id, {"title": "New title"})
    assert updated is not None
    assert updated.title == "New title"


# ---- IncidentEvent Repository ----

async def test_create_event(db_session):
    user = await _make_user(db_session, "u5@c.com")
    inc_repo = IncidentRepository(db_session)
    inc = await inc_repo.create(IncidentCreate(
        title="T", description="D", priority=2, category="Software",
        source="web", requester_id=user.id
    ))
    await db_session.flush()

    ev_repo = IncidentEventRepository(db_session)
    ev = await ev_repo.create(IncidentEventCreate(
        incident_id=inc.id, actor_id=user.id, event_type="comment",
        body="Looking into this now."
    ))
    await db_session.flush()
    assert ev.event_type == "comment"
    assert ev.event_metadata is None


async def test_list_events_for_incident(db_session):
    user = await _make_user(db_session, "u6@c.com")
    inc_repo = IncidentRepository(db_session)
    inc = await inc_repo.create(IncidentCreate(
        title="T", description="D", priority=1, category="Network",
        source="web", requester_id=user.id
    ))
    await db_session.flush()

    ev_repo = IncidentEventRepository(db_session)
    await ev_repo.create(IncidentEventCreate(
        incident_id=inc.id, actor_id=user.id, event_type="comment", body="First"
    ))
    await ev_repo.create(IncidentEventCreate(
        incident_id=inc.id, actor_id=user.id, event_type="work_note", body="Second"
    ))
    await db_session.flush()
    events = await ev_repo.list_for_incident(inc.id)
    assert len(events) == 2


# ---- Attachment Repository ----

async def test_create_attachment(db_session):
    user = await _make_user(db_session, "u7@c.com")
    inc_repo = IncidentRepository(db_session)
    inc = await inc_repo.create(IncidentCreate(
        title="T", description="D", priority=2, category="Software",
        source="web", requester_id=user.id
    ))
    await db_session.flush()

    att_repo = AttachmentRepository(db_session)
    att = await att_repo.create(AttachmentCreate(
        incident_id=inc.id, filename="log.txt", mime_type="text/plain",
        size_bytes=512, blob_ref="./uploads/log.txt", uploaded_by=user.id
    ))
    await db_session.flush()
    assert att.filename == "log.txt"


async def test_list_attachments_for_incident(db_session):
    user = await _make_user(db_session, "u8@c.com")
    inc_repo = IncidentRepository(db_session)
    inc = await inc_repo.create(IncidentCreate(
        title="T", description="D", priority=3, category="Hardware",
        source="web", requester_id=user.id
    ))
    await db_session.flush()

    att_repo = AttachmentRepository(db_session)
    await att_repo.create(AttachmentCreate(
        incident_id=inc.id, filename="a.pdf", mime_type="application/pdf",
        size_bytes=1024, blob_ref="./uploads/a.pdf", uploaded_by=user.id
    ))
    await db_session.flush()
    results = await att_repo.list_for_incident(inc.id)
    assert len(results) == 1
    assert results[0].filename == "a.pdf"


# ---- New tests for Task 2 enhancements ----

async def _make_incident(session, requester_id: str, title: str = "Test", priority: int = 3):
    repo = IncidentRepository(session)
    return await repo.create(IncidentCreate(
        title=title,
        description="desc",
        priority=priority,
        category="Network",
        source="web",
        requester_id=requester_id,
    ))


async def test_incident_list_filter_unassigned(db_session):
    user = await UserRepository(db_session).create(UserCreate(email="u@t.com", name="U", role="agent"))
    await db_session.flush()
    inc = await _make_incident(db_session, user.id)
    await db_session.flush()
    # unassigned filter
    results = await IncidentRepository(db_session).list(assignee_id="unassigned")
    assert any(i.id == inc.id for i in results)


async def test_incident_list_filter_q(db_session):
    user = await UserRepository(db_session).create(UserCreate(email="u2@t.com", name="U2", role="agent"))
    await db_session.flush()
    await _make_incident(db_session, user.id, title="Network is down")
    await _make_incident(db_session, user.id, title="Printer broken")
    await db_session.flush()
    results = await IncidentRepository(db_session).list(q="network")
    assert len(results) == 1
    assert "Network" in results[0].title


async def test_incident_count_matches_list(db_session):
    user = await UserRepository(db_session).create(UserCreate(email="u3@t.com", name="U3", role="agent"))
    await db_session.flush()
    for i in range(3):
        await _make_incident(db_session, user.id, title=f"Inc {i}")
    await db_session.flush()
    count = await IncidentRepository(db_session).count()
    items = await IncidentRepository(db_session).list()
    assert count == len(items)


async def test_event_repo_pagination(db_session):
    user = await UserRepository(db_session).create(UserCreate(email="u4@t.com", name="U4", role="agent"))
    await db_session.flush()
    inc = await _make_incident(db_session, user.id)
    await db_session.flush()
    repo = IncidentEventRepository(db_session)
    for i in range(5):
        await repo.create(IncidentEventCreate(
            incident_id=inc.id, actor_id=user.id,
            event_type="comment", body=f"comment {i}",
        ))
    await db_session.flush()
    page1 = await repo.list_for_incident(inc.id, limit=2, offset=0, order="asc")
    assert len(page1) == 2
    total = await repo.count_for_incident(inc.id)
    assert total == 5


async def test_user_repo_list_by_role(db_session):
    await UserRepository(db_session).create(UserCreate(email="a1@t.com", name="A1", role="agent"))
    await UserRepository(db_session).create(UserCreate(email="r1@t.com", name="R1", role="requester"))
    await db_session.flush()
    agents = await UserRepository(db_session).list_by_role("agent")
    assert all(u.role == "agent" for u in agents)


async def test_attachment_repo_delete(db_session):
    user = await UserRepository(db_session).create(UserCreate(email="u5@t.com", name="U5", role="agent"))
    await db_session.flush()
    inc = await _make_incident(db_session, user.id)
    await db_session.flush()
    repo = AttachmentRepository(db_session)
    att = await repo.create(AttachmentCreate(
        incident_id=inc.id, filename="f.txt", mime_type="text/plain",
        size_bytes=10, blob_ref="/tmp/f.txt", uploaded_by=user.id,
    ))
    await db_session.flush()
    deleted = await repo.delete(att.id)
    assert deleted is True
    assert await repo.get_by_id(att.id) is None


async def test_dashboard_summary(db_session):
    user = await UserRepository(db_session).create(UserCreate(email="u6@t.com", name="U6", role="agent"))
    await db_session.flush()
    await _make_incident(db_session, user.id)
    await db_session.flush()
    summary = await IncidentRepository(db_session).get_dashboard_summary(user.id)
    assert "my_open" in summary
    assert "all_open" in summary
    assert "unassigned" in summary
    assert "breached" in summary
    assert "by_state" in summary
    assert "by_priority" in summary
    assert summary["all_open"] >= 1
