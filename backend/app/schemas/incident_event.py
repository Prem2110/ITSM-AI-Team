from __future__ import annotations
from datetime import datetime
from pydantic import BaseModel, field_validator

_VALID_EVENT_TYPES = {
    "comment", "work_note", "state_change", "field_update",
    "assignment", "attachment_added",
}


class IncidentEventCreate(BaseModel):
    incident_id: str
    actor_id: str
    event_type: str
    body: str | None = None
    event_metadata: dict | None = None

    @field_validator("event_type")
    @classmethod
    def valid_event_type(cls, v: str) -> str:
        if v not in _VALID_EVENT_TYPES:
            raise ValueError(f"event_type must be one of: {sorted(_VALID_EVENT_TYPES)}")
        return v


class IncidentEventResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    incident_id: str
    actor_id: str
    event_type: str
    body: str | None
    event_metadata: dict | None
    created_at: datetime
