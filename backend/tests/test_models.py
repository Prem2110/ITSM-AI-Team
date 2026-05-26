from __future__ import annotations
import uuid
from sqlalchemy import select
from app.models.user import User
from app.models.incident import Incident
from app.models.incident_event import IncidentEvent
from app.models.attachment import Attachment


async def test_user_round_trip(db_session):
    user = User(
        id=str(uuid.uuid4()),
        email="test@example.com",
        name="Test User",
        role="agent",
    )
    db_session.add(user)
    await db_session.flush()
    result = await db_session.execute(select(User).where(User.email == "test@example.com"))
    fetched = result.scalar_one()
    assert fetched.name == "Test User"
    assert fetched.active is True


async def test_incident_round_trip(db_session):
    user = User(id=str(uuid.uuid4()), email="req@example.com", name="Requester", role="requester")
    db_session.add(user)
    await db_session.flush()

    incident = Incident(
        id=str(uuid.uuid4()),
        number="INC0000001",
        title="Test incident",
        description="Something broke",
        state="new",
        priority=2,
        category="Software",
        source="web",
        requester_id=user.id,
    )
    db_session.add(incident)
    await db_session.flush()
    result = await db_session.execute(select(Incident).where(Incident.number == "INC0000001"))
    fetched = result.scalar_one()
    assert fetched.title == "Test incident"
    assert fetched.sla_breached is False


async def test_incident_event_round_trip(db_session):
    user = User(id=str(uuid.uuid4()), email="a@b.com", name="A", role="agent")
    db_session.add(user)
    await db_session.flush()

    incident = Incident(
        id=str(uuid.uuid4()), number="INC0000002", title="T", description="D",
        state="new", priority=1, category="Network", source="web", requester_id=user.id,
    )
    db_session.add(incident)
    await db_session.flush()

    event = IncidentEvent(
        id=str(uuid.uuid4()),
        incident_id=incident.id,
        actor_id=user.id,
        event_type="comment",
        body="First comment",
    )
    db_session.add(event)
    await db_session.flush()
    result = await db_session.execute(
        select(IncidentEvent).where(IncidentEvent.incident_id == incident.id)
    )
    fetched = result.scalar_one()
    assert fetched.body == "First comment"
    assert fetched.event_metadata is None


async def test_attachment_round_trip(db_session):
    user = User(id=str(uuid.uuid4()), email="c@d.com", name="C", role="requester")
    db_session.add(user)
    await db_session.flush()
    incident = Incident(
        id=str(uuid.uuid4()), number="INC0000003", title="T", description="D",
        state="new", priority=3, category="Hardware", source="web", requester_id=user.id,
    )
    db_session.add(incident)
    await db_session.flush()
    att = Attachment(
        id=str(uuid.uuid4()),
        incident_id=incident.id,
        filename="screenshot.png",
        mime_type="image/png",
        size_bytes=12345,
        blob_ref="./uploads/screenshot.png",
        uploaded_by=user.id,
    )
    db_session.add(att)
    await db_session.flush()
    result = await db_session.execute(select(Attachment).where(Attachment.incident_id == incident.id))
    fetched = result.scalar_one()
    assert fetched.filename == "screenshot.png"
