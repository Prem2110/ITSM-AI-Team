from __future__ import annotations
import pytest


def test_tbl_empty_prefix_returns_bare_name(monkeypatch):
    """With empty prefix, tbl() is a no-op."""
    import app.config as cfg
    monkeypatch.setattr(cfg.env_settings, "table_prefix", "")
    assert cfg.tbl("users") == "users"
    assert cfg.tbl("incidents") == "incidents"
    assert cfg.tbl("incident_events") == "incident_events"
    assert cfg.tbl("attachments") == "attachments"
    assert cfg.tbl("INC_SEQ") == "INC_SEQ"


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


def test_tbl_empty_prefix_empty_name(monkeypatch):
    import app.config as cfg
    monkeypatch.setattr(cfg.env_settings, "table_prefix", "")
    assert cfg.tbl("") == ""


def test_resolve_url_sqlite_default(monkeypatch):
    """When no HANA vars set, returns the DATABASE_URL (SQLite default)."""
    monkeypatch.setenv("VCAP_SERVICES", "")
    import app.config as cfg
    monkeypatch.setattr(cfg.env_settings, "hana_address", "")
    from app.db import resolve_database_url
    url = resolve_database_url()
    assert "sqlite" in url


def test_resolve_url_hana_env_vars(monkeypatch):
    """When HANA_* vars are set, returns a hana+hdbcli:// URL."""
    monkeypatch.setenv("VCAP_SERVICES", "")
    import app.config as cfg
    monkeypatch.setattr(cfg.env_settings, "hana_address", "myhost.hana.cloud")
    monkeypatch.setattr(cfg.env_settings, "hana_port", 443)
    monkeypatch.setattr(cfg.env_settings, "hana_user", "MYUSER")
    monkeypatch.setattr(cfg.env_settings, "hana_password", "MYPASS")
    from app.db import resolve_database_url
    url = resolve_database_url()
    assert url.startswith("hana+hdbcli://")
    assert "myhost.hana.cloud" in url
    assert "443" in url
