from __future__ import annotations
import pytest
from datetime import datetime
from pydantic import ValidationError
from app.schemas.user import UserCreate, UserResponse
from app.schemas.incident import IncidentCreate, IncidentPatchRequest, IncidentResponse
from app.schemas.incident_event import IncidentEventCreate, IncidentEventResponse
from app.schemas.attachment import AttachmentResponse


def test_user_create_valid():
    u = UserCreate(email="a@b.com", name="Alice", role="agent")
    assert u.role == "agent"


def test_user_create_invalid_role():
    with pytest.raises(ValidationError, match="role"):
        UserCreate(email="a@b.com", name="Alice", role="superuser")


def test_incident_create_valid():
    i = IncidentCreate(
        title="VPN not connecting",
        description="Cannot connect to VPN since yesterday.",
        priority=1,
        category="Network",
        source="web",
        requester_id="some-uuid",
    )
    assert i.priority == 1


def test_incident_create_invalid_priority():
    with pytest.raises(ValidationError, match="priority"):
        IncidentCreate(
            title="T", description="D", priority=5,
            category="Network", source="web", requester_id="x"
        )


def test_incident_create_invalid_category():
    with pytest.raises(ValidationError, match="category"):
        IncidentCreate(
            title="T", description="D", priority=1,
            category="InvalidCat", source="web", requester_id="x"
        )


def test_incident_create_invalid_source():
    with pytest.raises(ValidationError, match="source"):
        IncidentCreate(
            title="T", description="D", priority=1,
            category="Software", source="fax", requester_id="x"
        )


def test_incident_update_partial():
    u = IncidentPatchRequest(title="Updated title")
    assert u.title == "Updated title"
    assert u.description is None


def test_event_create_valid():
    e = IncidentEventCreate(
        incident_id="inc-uuid",
        actor_id="user-uuid",
        event_type="comment",
        body="This is a comment",
    )
    assert e.event_type == "comment"


def test_event_create_invalid_type():
    with pytest.raises(ValidationError, match="event_type"):
        IncidentEventCreate(
            incident_id="x", actor_id="y",
            event_type="random_type", body="hi"
        )


def test_response_from_orm_attributes():
    class FakeUser:
        id = "uuid-1"
        email = "e@f.com"
        name = "Fake"
        role = "admin"
        active = True
        created_at = datetime(2026, 1, 1)
        updated_at = datetime(2026, 1, 1)

    resp = UserResponse.model_validate(FakeUser())
    assert resp.email == "e@f.com"
