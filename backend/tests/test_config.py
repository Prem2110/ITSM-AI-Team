from __future__ import annotations
import pytest


def test_tbl_empty_prefix_returns_bare_name():
    """With default empty prefix, tbl() is a no-op."""
    from app.config import tbl
    assert tbl("users") == "users"
    assert tbl("incidents") == "incidents"
    assert tbl("incident_events") == "incident_events"
    assert tbl("attachments") == "attachments"
    assert tbl("INC_SEQ") == "INC_SEQ"


def test_tbl_with_prefix_prepends_exactly(monkeypatch):
    """Prefix is prepended with no separator artifact."""
    import app.config as cfg
    monkeypatch.setattr(cfg.env_settings, "table_prefix", "ITSM_DEV_")
    assert cfg.tbl("users") == "ITSM_DEV_users"
    assert cfg.tbl("incidents") == "ITSM_DEV_incidents"
    assert cfg.tbl("INC_SEQ") == "ITSM_DEV_INC_SEQ"


def test_tbl_underscore_suffix_prefix_no_double_separator(monkeypatch):
    """Prefix ending in _ + name starting with letter — no double separator."""
    import app.config as cfg
    monkeypatch.setattr(cfg.env_settings, "table_prefix", "ITSM_PREM_")
    assert cfg.tbl("users") == "ITSM_PREM_users"


def test_tbl_empty_name_with_prefix(monkeypatch):
    """Empty name returns just the prefix (edge case, no artifact)."""
    import app.config as cfg
    monkeypatch.setattr(cfg.env_settings, "table_prefix", "ITSM_DEV_")
    assert cfg.tbl("") == "ITSM_DEV_"


def test_tbl_empty_prefix_empty_name():
    from app.config import tbl
    assert tbl("") == ""
