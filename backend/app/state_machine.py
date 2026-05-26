from __future__ import annotations
from .config import app_config

# States that require resolution_code + resolution_notes on entry
_REQUIRES_RESOLUTION: frozenset[str] = frozenset({"resolved"})


def can_transition(from_state: str, to_state: str) -> bool:
    """Return True if the from_state -> to_state transition is configured as valid."""
    allowed = app_config.state_transitions.get(from_state, [])
    return to_state in allowed


def validate_transition(from_state: str, to_state: str, payload: dict) -> None:
    """Raise ValueError if the transition is not allowed or required fields are missing.

    payload: dict of fields being set on this transition
    e.g. {"resolution_code": "...", "resolution_notes": "..."}
    """
    if not can_transition(from_state, to_state):
        allowed = app_config.state_transitions.get(from_state, [])
        raise ValueError(
            f"Cannot transition from '{from_state}' to '{to_state}'. "
            f"Allowed next states: {allowed}"
        )
    if to_state in _REQUIRES_RESOLUTION:
        missing = [
            f for f in ("resolution_code", "resolution_notes")
            if not payload.get(f)
        ]
        if missing:
            raise ValueError(
                f"Transitioning to '{to_state}' requires: {', '.join(missing)}"
            )
