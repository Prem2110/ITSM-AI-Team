from __future__ import annotations
import pytest
from tests.conftest import _seed_user

# No pytest.mark.asyncio needed — the conftest sets asyncio_mode=auto

VALID_SETUP_PAYLOAD = {
    "company_name": "Test Corp",
    "timezone": "America/New_York",
    "admin": {"name": "Alice Admin", "email": "alice@testcorp.com"},
    "sla_targets": {"1": 4, "2": 8, "3": 24, "4": 72},
    "resolution_codes": ["Fixed", "Workaround", "Cannot Reproduce"],
}

ADMIN_EMAIL = "admin@sierradigital.com"
AGENT_EMAIL = "agent@sierradigital.com"
REQUESTER_EMAIL = "req@sierradigital.com"

ADMIN_H = {"X-Fake-User": ADMIN_EMAIL}
AGENT_H = {"X-Fake-User": AGENT_EMAIL}
REQ_H = {"X-Fake-User": REQUESTER_EMAIL}


async def _seed_all_users(test_db):
    """Seed admin, agent and requester users into the test DB."""
    admin = await _seed_user(test_db, ADMIN_EMAIL, "Admin User", "admin")
    agent = await _seed_user(test_db, AGENT_EMAIL, "Agent User", "agent")
    req = await _seed_user(test_db, REQUESTER_EMAIL, "Requester User", "requester")
    return admin, agent, req


# ── Setup status and completion flow (uses client_fresh: no app_settings) ─────

async def test_setup_status_before_setup(client_fresh):
    r = await client_fresh.get("/api/setup/status")
    assert r.status_code == 200
    data = r.json()
    assert data["completed"] is False
    assert data["company_name"] is None


async def test_complete_setup_creates_admin_and_settings(client_fresh):
    r = await client_fresh.post("/api/setup/complete", json=VALID_SETUP_PAYLOAD)
    assert r.status_code == 200
    body = r.json()
    assert body["completed"] is True
    assert body["admin"]["email"] == "alice@testcorp.com"
    assert body["admin"]["role"] == "admin"


async def test_complete_setup_second_time_returns_409(client_fresh):
    await client_fresh.post("/api/setup/complete", json=VALID_SETUP_PAYLOAD)
    r = await client_fresh.post("/api/setup/complete", json=VALID_SETUP_PAYLOAD)
    assert r.status_code == 409


async def test_setup_status_after_setup(client_fresh):
    await client_fresh.post("/api/setup/complete", json=VALID_SETUP_PAYLOAD)
    r = await client_fresh.get("/api/setup/status")
    assert r.status_code == 200
    data = r.json()
    assert data["completed"] is True
    assert data["company_name"] == "Test Corp"


# ── Middleware: 503 when not setup ────────────────────────────────────────────

async def test_api_call_when_not_setup_returns_503(client_fresh):
    r = await client_fresh.get("/api/incidents")
    assert r.status_code == 503
    body = r.json()
    assert body["detail"] == "Setup required"
    assert body["redirect"] == "/setup"


async def test_setup_status_accessible_without_setup(client_fresh):
    # /api/setup/status must never be blocked by the middleware
    r = await client_fresh.get("/api/setup/status")
    assert r.status_code == 200


async def test_config_accessible_without_setup(client_fresh):
    # /api/config/* must never be blocked (wizard needs priorities)
    r = await client_fresh.get("/api/config/priorities")
    # Should not be 503 (may be 401 without auth, but not 503)
    assert r.status_code != 503


async def test_api_call_after_setup_not_503(client_fresh):
    await client_fresh.post("/api/setup/complete", json=VALID_SETUP_PAYLOAD)
    # After setup, /api/incidents should not return 503
    # (will return 401 because no user logged in, but not 503)
    r = await client_fresh.get("/api/incidents")
    assert r.status_code != 503


# ── Settings CRUD (uses regular client: app_settings already seeded) ──────────

async def test_get_settings_returns_current(client, test_db):
    await _seed_all_users(test_db)
    r = await client.get("/api/settings", headers=ADMIN_H)
    assert r.status_code == 200
    data = r.json()
    assert data["company_name"] == "Test Corp"
    assert data["timezone"] == "UTC"


async def test_patch_settings_as_non_admin_returns_403(client, test_db):
    await _seed_all_users(test_db)
    r = await client.patch(
        "/api/settings",
        json={"company_name": "Evil Corp"},
        headers=REQ_H,
    )
    assert r.status_code == 403


async def test_patch_settings_as_admin_updates(client, test_db):
    await _seed_all_users(test_db)
    r = await client.patch(
        "/api/settings",
        json={"company_name": "Renamed Corp", "timezone": "Europe/London"},
        headers=ADMIN_H,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["company_name"] == "Renamed Corp"
    assert body["timezone"] == "Europe/London"


async def test_patch_sla_targets_updates(client, test_db):
    await _seed_all_users(test_db)
    r = await client.patch(
        "/api/settings",
        json={"sla_targets": {"1": 2, "2": 6, "3": 20, "4": 60}},
        headers=ADMIN_H,
    )
    assert r.status_code == 200
    assert r.json()["sla_targets"] == {"1": 2, "2": 6, "3": 20, "4": 60}


async def test_patch_resolution_codes_updates(client, test_db):
    await _seed_all_users(test_db)
    r = await client.patch(
        "/api/settings",
        json={"resolution_codes": ["Fixed", "By Design"]},
        headers=ADMIN_H,
    )
    assert r.status_code == 200
    assert r.json()["resolution_codes"] == ["Fixed", "By Design"]


async def test_patch_settings_rejects_empty_company_name(client, test_db):
    await _seed_all_users(test_db)
    r = await client.patch(
        "/api/settings",
        json={"company_name": "   "},
        headers=ADMIN_H,
    )
    assert r.status_code == 422


async def test_patch_settings_rejects_non_positive_sla_targets(client, test_db):
    await _seed_all_users(test_db)
    r = await client.patch(
        "/api/settings",
        json={"sla_targets": {"1": 0, "2": 8, "3": 24, "4": 72}},
        headers=ADMIN_H,
    )
    assert r.status_code == 422


async def test_patch_settings_rejects_blank_resolution_codes(client, test_db):
    await _seed_all_users(test_db)
    r = await client.patch(
        "/api/settings",
        json={"resolution_codes": ["   "]},
        headers=ADMIN_H,
    )
    assert r.status_code == 422


async def test_patch_settings_rejects_sla_targets_missing_priority_key(client, test_db):
    await _seed_all_users(test_db)
    r = await client.patch(
        "/api/settings",
        json={"sla_targets": {"1": 4, "2": 8, "3": 24}},
        headers=ADMIN_H,
    )
    assert r.status_code == 422


async def test_patch_settings_rejects_sla_targets_unknown_priority_key(client, test_db):
    await _seed_all_users(test_db)
    r = await client.patch(
        "/api/settings",
        json={"sla_targets": {"1": 4, "2": 8, "3": 24, "4": 72, "5": 200}},
        headers=ADMIN_H,
    )
    assert r.status_code == 422


# ── SLA override from app_settings ───────────────────────────────────────────

async def test_sla_override_from_app_settings(client, test_db):
    """When app_settings.sla_targets has priority 1 = 2h, created incident uses 2h SLA."""
    await _seed_all_users(test_db)
    await client.patch(
        "/api/settings",
        json={"sla_targets": {"1": 2, "2": 8, "3": 24, "4": 72}},
        headers=ADMIN_H,
    )
    r = await client.post(
        "/api/incidents",
        json={
            "title": "SLA Override Test",
            "description": "checking SLA override",
            "priority": 1,
            "category": "Network",
            "source": "web",
        },
        headers=AGENT_H,
    )
    assert r.status_code == 201
    from datetime import datetime, timezone
    due_str = r.json()["sla_resolution_due"]
    # Strip trailing Z if present
    due_str = due_str.replace("Z", "+00:00")
    due = datetime.fromisoformat(due_str)
    if due.tzinfo is None:
        from datetime import timezone as tz
        due = due.replace(tzinfo=tz.utc)
    now = datetime.now(timezone.utc)
    diff_hours = (due - now).total_seconds() / 3600
    # Should be about 2h, not the default 4h from config.yaml
    assert diff_hours < 3.5, f"Expected ~2h SLA, got {diff_hours:.1f}h (should be less than 3.5h)"
    assert diff_hours > 0.5, f"SLA due is in the past, got {diff_hours:.1f}h"


# ── Resolution code validation ────────────────────────────────────────────────

async def test_resolution_code_validated_against_app_settings(client, test_db):
    """resolution_code not in app_settings.resolution_codes is rejected."""
    await _seed_all_users(test_db)

    # Set narrow resolution codes
    await client.patch(
        "/api/settings",
        json={"resolution_codes": ["Fixed", "Workaround"]},
        headers=ADMIN_H,
    )
    # Create an incident
    r = await client.post(
        "/api/incidents",
        json={"title": "T", "description": "D", "priority": 2, "category": "Network", "source": "web"},
        headers=AGENT_H,
    )
    assert r.status_code == 201
    inc_id = r.json()["id"]

    # Transition to assigned then in_progress
    await client.post(
        f"/api/incidents/{inc_id}/transition",
        json={"to_state": "assigned"},
        headers=AGENT_H,
    )
    await client.post(
        f"/api/incidents/{inc_id}/transition",
        json={"to_state": "in_progress"},
        headers=AGENT_H,
    )

    # Try to resolve with invalid code
    r = await client.post(
        f"/api/incidents/{inc_id}/transition",
        json={"to_state": "resolved", "resolution_code": "Not A Valid Code", "resolution_notes": "done"},
        headers=AGENT_H,
    )
    assert r.status_code == 422

    # Resolve with valid code
    r = await client.post(
        f"/api/incidents/{inc_id}/transition",
        json={"to_state": "resolved", "resolution_code": "Fixed", "resolution_notes": "done"},
        headers=AGENT_H,
    )
    assert r.status_code == 200
