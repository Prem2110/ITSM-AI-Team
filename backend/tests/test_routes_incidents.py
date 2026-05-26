from __future__ import annotations
import pytest
from tests.conftest import _seed_user


# ── Helpers ──────────────────────────────────────────────────────────────────

AGENT_EMAIL = "agent@routes.com"
REQUESTER_EMAIL = "req@routes.com"

AGENT_H = {"X-Fake-User": AGENT_EMAIL}
REQ_H = {"X-Fake-User": REQUESTER_EMAIL}


async def _seed_both(test_db):
    agent = await _seed_user(test_db, AGENT_EMAIL, "Test Agent", "agent")
    req = await _seed_user(test_db, REQUESTER_EMAIL, "Test Requester", "requester")
    return agent, req


async def _create_incident(client, headers, **overrides) -> dict:
    payload = {
        "title": "Test Incident",
        "description": "Something broke",
        "priority": 3,
        "category": "Network",
        "source": "web",
        **overrides,
    }
    resp = await client.post("/api/incidents", json=payload, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _force_state(test_db, incident_id: str, state: str, extra: dict | None = None):
    fields = {"state": state, **(extra or {})}
    async with test_db() as session:
        from app.repositories.incident_repository import IncidentRepository
        await IncidentRepository(session).update(incident_id, fields)
        await session.commit()


# ── Tests ─────────────────────────────────────────────────────────────────────

async def test_create_incident_returns_201(client, test_db):
    await _seed_both(test_db)
    data = await _create_incident(client, AGENT_H)
    assert data["state"] == "new"
    assert data["number"].startswith("INC")
    assert data["priority"] == 3


async def test_create_incident_defaults_requester_to_caller(client, test_db):
    agent, _ = await _seed_both(test_db)
    data = await _create_incident(client, AGENT_H)
    assert data["requester_id"] == agent.id


async def test_create_incident_requires_ticket_write(client, test_db):
    await _seed_both(test_db)
    # Requester has TicketWrite, should succeed
    data = await _create_incident(client, REQ_H)
    assert data["state"] == "new"


async def test_create_incident_no_auth_returns_401(client, test_db):
    resp = await client.post("/api/incidents", json={
        "title": "T", "description": "D", "priority": 2, "category": "Network",
    })
    assert resp.status_code == 401


async def test_create_incident_invalid_priority_returns_422(client, test_db):
    await _seed_both(test_db)
    resp = await client.post("/api/incidents", json={
        "title": "T", "description": "D", "priority": 99, "category": "Network",
    }, headers=AGENT_H)
    assert resp.status_code == 422


async def test_create_incident_invalid_category_returns_422(client, test_db):
    await _seed_both(test_db)
    resp = await client.post("/api/incidents", json={
        "title": "T", "description": "D", "priority": 2, "category": "Fake Category",
    }, headers=AGENT_H)
    assert resp.status_code == 422


async def test_list_incidents_returns_paginated(client, test_db):
    await _seed_both(test_db)
    for i in range(3):
        await _create_incident(client, AGENT_H, title=f"Inc {i}")
    resp = await client.get("/api/incidents?page=1&page_size=2", headers=AGENT_H)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 3
    assert len(data["items"]) == 2
    assert data["page"] == 1
    assert data["page_size"] == 2


async def test_list_incidents_filter_by_state(client, test_db):
    await _seed_both(test_db)
    inc = await _create_incident(client, AGENT_H)
    await _force_state(test_db, inc["id"], "assigned")

    resp = await client.get("/api/incidents?state=assigned", headers=AGENT_H)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["id"] == inc["id"]


async def test_list_incidents_filter_unassigned(client, test_db):
    await _seed_both(test_db)
    unassigned = await _create_incident(client, AGENT_H)

    resp = await client.get("/api/incidents?assignee_id=unassigned", headers=AGENT_H)
    assert resp.status_code == 200
    data = resp.json()
    assert any(i["id"] == unassigned["id"] for i in data["items"])


async def test_list_incidents_search_by_title(client, test_db):
    await _seed_both(test_db)
    await _create_incident(client, AGENT_H, title="Network is down")
    await _create_incident(client, AGENT_H, title="Printer broken")

    resp = await client.get("/api/incidents?q=network", headers=AGENT_H)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert "Network" in data["items"][0]["title"]


async def test_get_incident_detail_includes_requester(client, test_db):
    agent, _ = await _seed_both(test_db)
    inc = await _create_incident(client, AGENT_H)

    resp = await client.get(f"/api/incidents/{inc['id']}", headers=AGENT_H)
    assert resp.status_code == 200
    data = resp.json()
    assert "requester" in data
    assert data["requester"]["id"] == agent.id
    assert "events" in data
    assert len(data["events"]) >= 1  # at least the creation event


async def test_get_incident_not_found(client, test_db):
    await _seed_both(test_db)
    resp = await client.get("/api/incidents/nonexistent-id", headers=AGENT_H)
    assert resp.status_code == 404


async def test_patch_incident_requires_agent_scope(client, test_db):
    await _seed_both(test_db)
    inc = await _create_incident(client, AGENT_H)

    resp = await client.patch(
        f"/api/incidents/{inc['id']}",
        json={"title": "New Title"},
        headers=REQ_H,
    )
    assert resp.status_code == 403


async def test_patch_incident_updates_fields(client, test_db):
    await _seed_both(test_db)
    inc = await _create_incident(client, AGENT_H)

    resp = await client.patch(
        f"/api/incidents/{inc['id']}",
        json={"title": "Updated Title", "priority": 1},
        headers=AGENT_H,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["title"] == "Updated Title"
    assert data["priority"] == 1


async def test_patch_incident_rejects_state_field(client, test_db):
    await _seed_both(test_db)
    inc = await _create_incident(client, AGENT_H)

    resp = await client.patch(
        f"/api/incidents/{inc['id']}",
        json={"state": "resolved"},
        headers=AGENT_H,
    )
    assert resp.status_code == 422  # extra="forbid" rejects unknown field


async def test_transition_new_to_assigned(client, test_db):
    await _seed_both(test_db)
    inc = await _create_incident(client, AGENT_H)

    resp = await client.post(
        f"/api/incidents/{inc['id']}/transition",
        json={"to_state": "assigned"},
        headers=AGENT_H,
    )
    assert resp.status_code == 200
    assert resp.json()["state"] == "assigned"


async def test_transition_to_resolved_requires_resolution(client, test_db):
    await _seed_both(test_db)
    inc = await _create_incident(client, AGENT_H)
    await _force_state(test_db, inc["id"], "in_progress")

    resp = await client.post(
        f"/api/incidents/{inc['id']}/transition",
        json={"to_state": "resolved"},
        headers=AGENT_H,
    )
    assert resp.status_code == 422


async def test_transition_to_resolved_with_resolution_fields(client, test_db):
    await _seed_both(test_db)
    inc = await _create_incident(client, AGENT_H)
    await _force_state(test_db, inc["id"], "in_progress")

    resp = await client.post(
        f"/api/incidents/{inc['id']}/transition",
        json={"to_state": "resolved", "resolution_code": "fixed", "resolution_notes": "All done"},
        headers=AGENT_H,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["state"] == "resolved"
    assert data["resolved_at"] is not None
    assert data["resolution_code"] == "fixed"


async def test_requester_can_close_own_resolved_ticket(client, test_db):
    agent, req = await _seed_both(test_db)
    inc = await _create_incident(client, AGENT_H, requester_id=req.id)
    await _force_state(test_db, inc["id"], "resolved", {
        "resolution_code": "fixed",
        "resolution_notes": "Done",
    })

    resp = await client.post(
        f"/api/incidents/{inc['id']}/transition",
        json={"to_state": "closed"},
        headers=REQ_H,
    )
    assert resp.status_code == 200
    assert resp.json()["state"] == "closed"


async def test_requester_cannot_close_other_requester_ticket(client, test_db):
    agent, req = await _seed_both(test_db)
    other = await _seed_user(test_db, "other@routes.com", "Other", "requester")
    # Incident owned by req, but other tries to close it
    inc = await _create_incident(client, AGENT_H, requester_id=req.id)
    await _force_state(test_db, inc["id"], "resolved", {
        "resolution_code": "fixed", "resolution_notes": "Done",
    })

    resp = await client.post(
        f"/api/incidents/{inc['id']}/transition",
        json={"to_state": "closed"},
        headers={"X-Fake-User": "other@routes.com"},
    )
    assert resp.status_code == 403


async def test_sla_breach_marked_on_get(client, test_db):
    await _seed_both(test_db)
    inc = await _create_incident(client, AGENT_H)

    # Backdate sla_resolution_due to past
    async with test_db() as session:
        from app.repositories.incident_repository import IncidentRepository
        from app.utils import utcnow
        past = utcnow().replace(year=2020)
        await IncidentRepository(session).update(inc["id"], {"sla_resolution_due": past})
        await session.commit()

    resp = await client.get(f"/api/incidents/{inc['id']}", headers=AGENT_H)
    assert resp.status_code == 200
    assert resp.json()["sla_breached"] is True


async def test_dashboard_summary(client, test_db):
    await _seed_both(test_db)
    await _create_incident(client, AGENT_H)
    resp = await client.get("/api/dashboard/summary", headers=AGENT_H)
    assert resp.status_code == 200
    data = resp.json()
    assert data["all_open"] >= 1
    assert "by_state" in data
    assert "by_priority" in data


async def test_config_priorities(client, test_db):
    await _seed_both(test_db)
    resp = await client.get("/api/config/priorities", headers=AGENT_H)
    assert resp.status_code == 200
    priorities = resp.json()
    assert len(priorities) == 4
    assert priorities[0]["level"] == 1
    assert priorities[0]["name"] == "Critical"


async def test_users_list_requires_agent_scope(client, test_db):
    await _seed_both(test_db)
    resp = await client.get("/api/users", headers=REQ_H)
    assert resp.status_code == 403


async def test_users_list_by_role(client, test_db):
    await _seed_both(test_db)
    resp = await client.get("/api/users?role=agent", headers=AGENT_H)
    assert resp.status_code == 200
    users = resp.json()
    assert all(u["role"] == "agent" for u in users)
