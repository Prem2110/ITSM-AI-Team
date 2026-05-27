from __future__ import annotations
from datetime import datetime
from pydantic import BaseModel, field_validator


class AdminBootstrap(BaseModel):
    name: str
    email: str


class SetupCompleteRequest(BaseModel):
    company_name: str
    timezone: str
    admin: AdminBootstrap
    sla_targets: dict[str, int]
    resolution_codes: list[str]

    @field_validator("company_name")
    @classmethod
    def company_name_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("company_name cannot be empty")
        return v.strip()

    @field_validator("sla_targets")
    @classmethod
    def sla_targets_positive(cls, v: dict) -> dict:
        for k, hours in v.items():
            if not isinstance(hours, int) or hours <= 0:
                raise ValueError(f"sla_targets[{k}] must be a positive integer")
        return v

    @field_validator("resolution_codes")
    @classmethod
    def resolution_codes_non_empty(cls, v: list) -> list:
        codes = [c.strip() for c in v if c.strip()]
        if not codes:
            raise ValueError("resolution_codes must contain at least one entry")
        return codes


class AppSettingsPatch(BaseModel):
    company_name: str | None = None
    timezone: str | None = None
    sla_targets: dict[str, int] | None = None
    resolution_codes: list[str] | None = None


class AppSettingsResponse(BaseModel):
    id: str
    company_name: str
    timezone: str
    sla_targets: dict | None
    resolution_codes: list | None
    setup_completed_at: datetime
    setup_completed_by: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
