from __future__ import annotations
from datetime import datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, field_validator

_VALID_EVENT_TYPES = frozenset({
    "comment", "work_note", "state_change", "field_update",
    "assignment", "attachment_added", "attachment_deleted",
})


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


class EventCreateRequest(BaseModel):
    """API request body for POST /api/incidents/{id}/events."""
    model_config = ConfigDict(extra="forbid")

    event_type: Literal["comment", "work_note"]
    body: str


class IncidentEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    incident_id: str
    actor_id: str
    event_type: str
    body: str | None
    event_metadata: dict | None
    created_at: datetime
