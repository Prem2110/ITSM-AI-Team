from __future__ import annotations
from datetime import datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator
from ..config import app_config
from .user import UserResponse
from .incident_event import IncidentEventResponse

_VALID_SOURCES = frozenset({"web", "email", "classifier_escalation", "fix_failed_escalation"})


class IncidentCreate(BaseModel):
    """Internal schema used by IncidentService → IncidentRepository.create()."""
    title: str
    description: str
    priority: int
    category: str
    source: str
    requester_id: str
    assignee_id: str | None = None

    @field_validator("priority")
    @classmethod
    def valid_priority(cls, v: int) -> int:
        if not 0 <= v <= len(app_config.priorities) - 1:
            raise ValueError(f"priority must be 0–{len(app_config.priorities) - 1}")
        return v

    @field_validator("source")
    @classmethod
    def valid_source(cls, v: str) -> str:
        if v not in _VALID_SOURCES:
            raise ValueError(f"source must be one of: {sorted(_VALID_SOURCES)}")
        return v


class IncidentCreateRequest(BaseModel):
    """API request body for POST /api/incidents. No state field — always starts 'new'."""
    model_config = ConfigDict(extra="forbid")

    title: str
    description: str
    priority: int
    category: str
    source: str = "web"
    assignee_id: str | None = None
    requester_id: str | None = None  # defaults to caller.user_id if omitted

    @field_validator("priority")
    @classmethod
    def valid_priority(cls, v: int) -> int:
        if not 0 <= v <= len(app_config.priorities) - 1:
            raise ValueError(f"priority must be 0–{len(app_config.priorities) - 1}")
        return v

    @field_validator("source")
    @classmethod
    def valid_source(cls, v: str) -> str:
        if v not in _VALID_SOURCES:
            raise ValueError(f"source must be one of: {sorted(_VALID_SOURCES)}")
        return v


class IncidentPatchRequest(BaseModel):
    """API request body for PATCH /api/incidents/{id}. Agent-only. No state field."""
    model_config = ConfigDict(extra="forbid")

    title: str | None = None
    description: str | None = None
    priority: int | None = None
    category: str | None = None
    assignee_id: str | None = None

    @field_validator("priority")
    @classmethod
    def valid_priority(cls, v: int | None) -> int | None:
        if v is not None and not 0 <= v <= len(app_config.priorities) - 1:
            raise ValueError(f"priority must be 0–{len(app_config.priorities) - 1}")
        return v

    @field_validator("category")
    @classmethod
    def valid_category(cls, v: str | None) -> str | None:
        if v is not None and v not in app_config.categories:
            raise ValueError(f"category must be one of: {app_config.categories}")
        return v


class TransitionRequest(BaseModel):
    """API request body for POST /api/incidents/{id}/transition."""
    model_config = ConfigDict(extra="forbid")

    to_state: str = Field(
        description="Target workflow state. Must be a configured next state from the current state."
    )
    resolution_code: str | None = Field(
        default=None,
        description="Required when transitioning into 'resolved'. Must match configured resolution codes.",
    )
    resolution_notes: str | None = Field(
        default=None,
        description="Required when transitioning into 'resolved'.",
    )

    @field_validator("to_state")
    @classmethod
    def valid_to_state(cls, v: str) -> str:
        if v not in app_config.states:
            raise ValueError(f"to_state must be one of: {app_config.states}")
        return v


class IncidentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    number: str
    title: str
    description: str
    state: str
    priority: int
    category: str
    source: str
    requester_id: str
    assignee_id: str | None
    resolution_code: str | None
    resolution_notes: str | None
    sla_resolution_due: datetime | None
    sla_paused_at: datetime | None
    sla_breached: bool
    created_at: datetime
    updated_at: datetime
    resolved_at: datetime | None
    closed_at: datetime | None


class IncidentListItem(BaseModel):
    id: str
    number: str
    title: str
    state: str
    priority: int
    category: str
    assignee_id: str | None
    assignee_name: str | None
    sla_breached: bool
    created_at: datetime
    updated_at: datetime


class IncidentListResponse(BaseModel):
    items: list[IncidentListItem]
    total: int
    page: int
    page_size: int


class IncidentDetail(BaseModel):
    """Full incident with requester/assignee and last 50 events."""
    id: str
    number: str
    title: str
    description: str
    state: str
    priority: int
    category: str
    source: str
    requester_id: str
    assignee_id: str | None
    resolution_code: str | None
    resolution_notes: str | None
    sla_resolution_due: datetime | None
    sla_paused_at: datetime | None
    sla_breached: bool
    created_at: datetime
    updated_at: datetime
    resolved_at: datetime | None
    closed_at: datetime | None
    requester: UserResponse
    assignee: UserResponse | None
    events: list[IncidentEventResponse]
