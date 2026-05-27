from __future__ import annotations
import uuid
from app.models.user import User
from app.models.incident import Incident
from app.services.numbering import next_incident_number


async def test_first_number_is_one(db_session):
    num = await next_incident_number(db_session)
    assert num == "INC0000001"


async def test_second_number_increments(db_session):
    user = User(id=str(uuid.uuid4()), email="x@y.com", name="X", role="requester")
    db_session.add(user)
    await db_session.flush()

    first_num = await next_incident_number(db_session)
    inc = Incident(
        id=str(uuid.uuid4()), number=first_num,
        title="T", description="D", state="new",
        priority=1, category="Network", source="web",
        requester_id=user.id,
    )
    db_session.add(inc)
    await db_session.flush()

    num = await next_incident_number(db_session)
    assert num == "INC0000002"


async def test_number_format_is_zero_padded(db_session):
    num = await next_incident_number(db_session)
    assert len(num) == 10  # "INC" (3) + 7 digits
    assert num.startswith("INC")
    assert num[3:].isdigit()
