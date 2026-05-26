from __future__ import annotations
import pytest
from tests.conftest import _seed_user


async def test_get_me_returns_caller(client, test_db):
    await _seed_user(test_db, "agent@test.com", "Test Agent", "agent")
    resp = await client.get("/api/me", headers={"X-Fake-User": "agent@test.com"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == "agent@test.com"
    assert data["name"] == "Test Agent"
    assert "TicketRead" in data["scopes"]
    assert "Agent" in data["scopes"]
    assert "Admin" not in data["scopes"]


async def test_get_me_missing_header(client):
    resp = await client.get("/api/me")
    assert resp.status_code == 401


async def test_get_me_unknown_user(client):
    resp = await client.get("/api/me", headers={"X-Fake-User": "ghost@test.com"})
    assert resp.status_code == 401


async def test_get_me_requester_scope(client, test_db):
    await _seed_user(test_db, "req@test.com", "Test Requester", "requester")
    resp = await client.get("/api/me", headers={"X-Fake-User": "req@test.com"})
    assert resp.status_code == 200
    data = resp.json()
    assert "TicketRead" in data["scopes"]
    assert "Agent" not in data["scopes"]


async def test_get_me_admin_has_all_scopes(client, test_db):
    await _seed_user(test_db, "admin@test.com", "Test Admin", "admin")
    resp = await client.get("/api/me", headers={"X-Fake-User": "admin@test.com"})
    assert resp.status_code == 200
    data = resp.json()
    assert set(data["scopes"]) == {"TicketRead", "TicketWrite", "Agent", "Admin"}
