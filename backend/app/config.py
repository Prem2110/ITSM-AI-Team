from __future__ import annotations
from pathlib import Path
from typing import Any, Literal
import yaml
from pydantic import BaseModel, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


# ---- YAML-backed models ----

class Priority(BaseModel):
    name: str
    color: str
    sla_hours: int


class AppConfig(BaseModel):
    company_name: str
    number_prefix: str
    priorities: list[Priority]
    categories: list[str]
    states: list[str]
    state_transitions: dict[str, list[str]]

    @field_validator("state_transitions")
    @classmethod
    def transitions_reference_valid_states(
        cls, v: dict[str, list[str]], info: Any
    ) -> dict[str, list[str]]:
        if not info.data.get("states"):
            return v  # states validation already failed
        states = set(info.data.get("states", []))
        for src, targets in v.items():
            if src not in states:
                raise ValueError(f"state_transitions key '{src}' is not in states list")
            for t in targets:
                if t not in states:
                    raise ValueError(
                        f"state_transitions['{src}'] contains '{t}' which is not in states list"
                    )
        return v


# ---- Env-var settings ----

class EnvSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(Path(__file__).parent.parent / ".env"),
        extra="ignore",
    )

    database_url: str = "sqlite+aiosqlite:///./dev.db"
    auth_mode: Literal["fake", "real"] = "fake"
    xsuaa_url: str = ""
    xsuaa_client_id: str = ""
    xsuaa_client_secret: str = ""
    xsuaa_xsappname: str = ""
    cors_origins: list[str] = ["*"]


def _load_yaml_config() -> AppConfig:
    config_path = Path(__file__).parent.parent / "config.yaml"
    try:
        with open(config_path, "r") as f:
            raw = yaml.safe_load(f) or {}
    except FileNotFoundError:
        raise RuntimeError(
            f"config.yaml not found at {config_path}. "
            "Copy backend/config.yaml to that path before starting the server."
        )
    return AppConfig(**raw)


# Singletons loaded at import time
app_config: AppConfig = _load_yaml_config()
env_settings: EnvSettings = EnvSettings()
