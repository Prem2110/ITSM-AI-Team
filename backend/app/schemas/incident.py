from __future__ import annotations
from datetime import datetime
from pydantic import BaseModel, field_validator
from ..config import app_config

_VALID_SOURCES = {"web", "email", "classifier_escalation", "fix_failed_escalation"}


class IncidentCreate(BaseModel):
    title: str
    description: str
    priority: int
    category: str
    source: str
    requester_id: str
    assignee_id: str | None = None
    state: str = "new"

    @field_validator("priority")
    @classmethod
    def valid_priority(cls, v: int) -> int:
        if not 1 <= v <= len(app_config.priorities):
            raise ValueError(f"priority must be between 1 and {len(app_config.priorities)}")
        return v

    @field_validator("category")
    @classmethod
    def valid_category(cls, v: str) -> str:
        if v not in app_config.categories:
            raise ValueError(f"category must be one of: {app_config.categories}")
        return v

    @field_validator("source")
    @classmethod
    def valid_source(cls, v: str) -> str:
        if v not in _VALID_SOURCES:
            raise ValueError(f"source must be one of: {sorted(_VALID_SOURCES)}")
        return v

    @field_validator("state")
    @classmethod
    def valid_state(cls, v: str) -> str:
        if v not in app_config.states:
            raise ValueError(f"state must be one of: {app_config.states}")
        return v


class IncidentUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    priority: int | None = None
    category: str | None = None
    assignee_id: str | None = None
    resolution_code: str | None = None
    resolution_notes: str | None = None

    @field_validator("priority")
    @classmethod
    def valid_priority(cls, v: int | None) -> int | None:
        if v is not None and not 1 <= v <= len(app_config.priorities):
            raise ValueError(f"priority must be between 1 and {len(app_config.priorities)}")
        return v

    @field_validator("category")
    @classmethod
    def valid_category(cls, v: str | None) -> str | None:
        if v is not None and v not in app_config.categories:
            raise ValueError(f"category must be one of: {app_config.categories}")
        return v


class IncidentResponse(BaseModel):
    model_config = {"from_attributes": True}

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
    sla_breached: bool
    created_at: datetime
    updated_at: datetime
    resolved_at: datetime | None
    closed_at: datetime | None


class IncidentListItem(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    number: str
    title: str
    state: str
    priority: int
    category: str
    assignee_id: str | None
    sla_breached: bool
    created_at: datetime
    updated_at: datetime
