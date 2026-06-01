from __future__ import annotations
from datetime import datetime
from pydantic import BaseModel, field_validator
from ..config import app_config


def _validate_sla_target_keys(v: dict[str, int]) -> dict[str, int]:
    expected_keys = {str(i) for i in range(len(app_config.priorities))}
    actual_keys = set(v.keys())
    missing = sorted(expected_keys - actual_keys)
    extra = sorted(actual_keys - expected_keys)
    if missing or extra:
        problems: list[str] = []
        if missing:
            problems.append(f"missing keys: {missing}")
        if extra:
            problems.append(f"unknown keys: {extra}")
        raise ValueError(
            f"sla_targets must include exactly priority keys {sorted(expected_keys)} ({'; '.join(problems)})"
        )
    return v


class AdminBootstrap(BaseModel):
    name: str
    email: str


class SetupCompleteRequest(BaseModel):
    company_name: str
    timezone: str
    admin: AdminBootstrap
    sla_targets: dict[str, int]
    resolution_codes: list[str]
    categories: list[str] | None = None
    sources: list[str] | None = None

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
        return _validate_sla_target_keys(v)

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
    categories: list[str] | None = None
    sources: list[str] | None = None
    ai_enabled: int | None = None
    openrouter_api_key: str | None = None
    openrouter_model: str | None = None

    @field_validator("company_name")
    @classmethod
    def patch_company_name_not_empty(cls, v: str | None) -> str | None:
        if v is None:
            return v
        value = v.strip()
        if not value:
            raise ValueError("company_name cannot be empty")
        return value

    @field_validator("timezone")
    @classmethod
    def patch_timezone_not_empty(cls, v: str | None) -> str | None:
        if v is None:
            return v
        value = v.strip()
        if not value:
            raise ValueError("timezone cannot be empty")
        return value

    @field_validator("sla_targets")
    @classmethod
    def patch_sla_targets_positive(cls, v: dict[str, int] | None) -> dict[str, int] | None:
        if v is None:
            return v
        for k, hours in v.items():
            if not isinstance(hours, int) or hours <= 0:
                raise ValueError(f"sla_targets[{k}] must be a positive integer")
        return _validate_sla_target_keys(v)

    @field_validator("resolution_codes")
    @classmethod
    def patch_resolution_codes_non_empty(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return v
        codes = [c.strip() for c in v if c.strip()]
        if not codes:
            raise ValueError("resolution_codes must contain at least one entry")
        return codes


class AppSettingsResponse(BaseModel):
    id: str
    company_name: str
    timezone: str
    sla_targets: dict | None
    resolution_codes: list | None
    categories: list | None = None
    sources: list | None = None
    ai_enabled: int | None = 0
    openrouter_model: str | None = None
    setup_completed_at: datetime
    setup_completed_by: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
