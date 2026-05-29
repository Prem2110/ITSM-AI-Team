from __future__ import annotations
import pytest
from datetime import timedelta
from tests.conftest import _seed_user

AGENT_EMAIL = "dash-agent@test.com"
REQ_EMAIL = "dash-req@test.com"
AGENT_H = {"X-Fake-User": AGENT_EMAIL}
REQ_H = {"X-Fake-User": REQ_EMAIL}


async def _seed_both(test_db):
    agent = await _seed_user(test_db, AGENT_EMAIL, "Dash Agent", "agent")
    req = await _seed_user(test_db, REQ_EMAIL, "Dash Requester", "requester")
    return agent, req


async def _create(client, headers, **kw) -> dict:
    payload = {
        "title": "Test",
        "description": "desc",
        "priority": 3,
        "category": "Network",
        "source": "web",
        **kw,
    }
    r = await client.post("/api/incidents", json=payload, headers=headers)
    assert r.status_code == 201
    return r.json()


async def _force_state(test_db, incident_id: str, state: str, extra: dict | None = None):
    async with test_db() as session:
        from app.repositories.incident_repository import IncidentRepository
        await IncidentRepository(session).update(incident_id, {"state": state, **(extra or {})})
        await session.commit()


# ── /trends ────────────────────────────────────────────────────────────────────

async def test_trends_shape(client, test_db):
    await _seed_both(test_db)
    r = await client.get("/api/dashboard/trends?days=7", headers=AGENT_H)
    assert r.status_code == 200
    data = r.json()
    assert "dates" in data and "new_counts" in data and "resolved_counts" in data
    assert len(data["dates"]) == 7
    assert len(data["new_counts"]) == 7
    assert len(data["resolved_counts"]) == 7


async def test_trends_gap_fill(client, test_db):
    """Days with no incidents must be 0, not missing."""
    await _seed_both(test_db)
    r = await client.get("/api/dashboard/trends?days=14", headers=AGENT_H)
    assert r.status_code == 200
    data = r.json()
    assert len(data["new_counts"]) == 14
    assert all(isinstance(v, int) for v in data["new_counts"])
    assert all(isinstance(v, int) for v in data["resolved_counts"])


async def test_trends_counts_incident(client, test_db):
    """Creating an incident today should increment new_counts for today."""
    await _seed_both(test_db)
    await _create(client, AGENT_H)
    r = await client.get("/api/dashboard/trends?days=7", headers=AGENT_H)
    assert r.status_code == 200
    data = r.json()
    total_new = sum(data["new_counts"])
    assert total_new >= 1


async def test_trends_requires_auth(client, test_db):
    r = await client.get("/api/dashboard/trends?days=7")
    assert r.status_code in (401, 403)


# ── /sla_compliance ────────────────────────────────────────────────────────────

async def test_sla_compliance_zero_when_no_resolved(client, test_db):
    await _seed_both(test_db)
    r = await client.get("/api/dashboard/sla_compliance?days=30", headers=AGENT_H)
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 0
    assert data["met"] == 0
    assert data["compliance_pct"] == 0.0


async def test_sla_compliance_shape(client, test_db):
    from app.utils import utcnow
    await _seed_both(test_db)
    inc = await _create(client, AGENT_H)
    await _force_state(test_db, inc["id"], "resolved", {"resolved_at": utcnow()})
    r = await client.get("/api/dashboard/sla_compliance?days=30", headers=AGENT_H)
    assert r.status_code == 200
    data = r.json()
    assert "compliance_pct" in data
    assert "met" in data
    assert "total" in data
    assert isinstance(data["compliance_pct"], float)


async def test_sla_compliance_met_counts(client, test_db):
    """Incident resolved before sla_due should count as met."""
    from app.utils import utcnow
    await _seed_both(test_db)
    inc = await _create(client, AGENT_H)

    # resolved_at = now, sla_resolution_due is in the future (created just now + sla hours)
    # so resolved_at <= sla_resolution_due → met
    await _force_state(test_db, inc["id"], "resolved", {"resolved_at": utcnow()})
    r = await client.get("/api/dashboard/sla_compliance?days=30", headers=AGENT_H)
    assert r.status_code == 200
    data = r.json()
    assert data["total"] >= 1
    assert data["met"] >= 1
    assert data["compliance_pct"] > 0


async def test_sla_compliance_requires_auth(client, test_db):
    r = await client.get("/api/dashboard/sla_compliance?days=30")
    assert r.status_code in (401, 403)


# ── /top_categories ────────────────────────────────────────────────────────────

async def test_top_categories_shape(client, test_db):
    await _seed_both(test_db)
    r = await client.get("/api/dashboard/top_categories?days=30&limit=5", headers=AGENT_H)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)


async def test_top_categories_populated(client, test_db):
    await _seed_both(test_db)
    await _create(client, AGENT_H, category="Network")
    await _create(client, AGENT_H, category="Network")
    await _create(client, AGENT_H, category="Hardware")
    r = await client.get("/api/dashboard/top_categories?days=30&limit=5", headers=AGENT_H)
    assert r.status_code == 200
    data = r.json()
    assert len(data) >= 2
    categories = [d["category"] for d in data]
    assert "Network" in categories
    assert "Hardware" in categories
    # Network should be first (2 > 1)
    assert data[0]["category"] == "Network"
    assert data[0]["count"] == 2


async def test_top_categories_limit(client, test_db):
    await _seed_both(test_db)
    # Use valid categories from config.yaml
    cats = ["Network", "Hardware", "Software", "Account Access", "SAP Integration"]
    for cat in cats:
        await _create(client, AGENT_H, category=cat)
    r = await client.get("/api/dashboard/top_categories?days=30&limit=3", headers=AGENT_H)
    assert r.status_code == 200
    data = r.json()
    assert len(data) <= 3


async def test_top_categories_requires_auth(client, test_db):
    r = await client.get("/api/dashboard/top_categories?days=30&limit=5")
    assert r.status_code in (401, 403)


# ── /summary ───────────────────────────────────────────────────────────────────

async def test_summary_breached_filter(client, test_db):
    """Verifies breached count in summary is accurate."""
    await _seed_both(test_db)
    inc = await _create(client, AGENT_H)
    await _force_state(test_db, inc["id"], "new", {"sla_breached": True})
    r = await client.get("/api/dashboard/summary", headers=AGENT_H)
    assert r.status_code == 200
    data = r.json()
    assert data["breached"] >= 1
