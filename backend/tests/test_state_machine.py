from __future__ import annotations
import pytest
from app.state_machine import can_transition, validate_transition


def test_new_to_assigned_is_valid():
    assert can_transition("new", "assigned") is True


def test_new_to_resolved_is_invalid():
    assert can_transition("new", "resolved") is False


def test_assigned_to_in_progress_is_valid():
    assert can_transition("assigned", "in_progress") is True


def test_assigned_to_closed_is_invalid():
    assert can_transition("assigned", "closed") is False


def test_in_progress_to_resolved_is_valid():
    assert can_transition("in_progress", "resolved") is True


def test_closed_has_no_transitions():
    assert can_transition("closed", "new") is False
    assert can_transition("closed", "resolved") is False


def test_unknown_state_is_invalid():
    assert can_transition("ghost_state", "new") is False


def test_valid_transition_no_exception():
    validate_transition("new", "assigned", {})


def test_invalid_transition_raises():
    with pytest.raises(ValueError, match="Cannot transition"):
        validate_transition("new", "closed", {})


def test_resolve_requires_resolution_fields():
    with pytest.raises(ValueError, match="resolution_code"):
        validate_transition("in_progress", "resolved", {})


def test_resolve_with_missing_notes_raises():
    with pytest.raises(ValueError, match="resolution_notes"):
        validate_transition("in_progress", "resolved", {"resolution_code": "fixed"})


def test_resolve_with_all_fields_passes():
    validate_transition(
        "in_progress", "resolved",
        {"resolution_code": "fixed", "resolution_notes": "Reinstalled driver."}
    )


def test_closed_to_anything_raises():
    with pytest.raises(ValueError, match="Cannot transition"):
        validate_transition("closed", "new", {})
