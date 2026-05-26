from __future__ import annotations
from datetime import datetime
from pydantic import BaseModel, field_validator

_VALID_ROLES = {"requester", "agent", "admin"}


class UserCreate(BaseModel):
    email: str
    name: str
    role: str

    @field_validator("email")
    @classmethod
    def valid_email(cls, v: str) -> str:
        if "@" not in v or len(v) < 5:
            raise ValueError("must be a valid email address")
        return v.lower()

    @field_validator("role")
    @classmethod
    def valid_role(cls, v: str) -> str:
        if v not in _VALID_ROLES:
            raise ValueError(f"role must be one of: {sorted(_VALID_ROLES)}")
        return v


class UserUpdate(BaseModel):
    name: str | None = None
    role: str | None = None
    active: bool | None = None

    @field_validator("role")
    @classmethod
    def valid_role(cls, v: str | None) -> str | None:
        if v is not None and v not in _VALID_ROLES:
            raise ValueError(f"role must be one of: {sorted(_VALID_ROLES)}")
        return v


class UserResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    email: str
    name: str
    role: str
    active: bool
    created_at: datetime
    updated_at: datetime
