from __future__ import annotations
from pathlib import Path
from tests.conftest import _seed_user

AGENT_EMAIL = "att-agent@test.com"
AGENT_H = {"X-Fake-User": AGENT_EMAIL}


async def _create_incident(client) -> dict:
    r = await client.post(
        "/api/incidents",
        json={
            "title": "Attachment target",
            "description": "desc",
            "priority": 3,
            "category": "Network",
            "source": "web",
        },
        headers=AGENT_H,
    )
    assert r.status_code == 201
    return r.json()


async def test_attachment_upload_rejects_unsupported_mime(client, test_db, tmp_path, monkeypatch):
    await _seed_user(test_db, AGENT_EMAIL, "Agent", "agent")
    from app.routers import attachments as attachments_router
    monkeypatch.setattr(attachments_router, "_UPLOAD_DIR", Path(tmp_path))

    inc = await _create_incident(client)
    files = {"file": ("malware.exe", b"binary", "application/x-msdownload")}
    r = await client.post(f"/api/incidents/{inc['id']}/attachments", files=files, headers=AGENT_H)
    assert r.status_code == 415


async def test_attachment_upload_accepts_allowed_mime(client, test_db, tmp_path, monkeypatch):
    await _seed_user(test_db, AGENT_EMAIL, "Agent", "agent")
    from app.routers import attachments as attachments_router
    monkeypatch.setattr(attachments_router, "_UPLOAD_DIR", Path(tmp_path))

    inc = await _create_incident(client)
    files = {"file": ("note.txt", b"hello world", "text/plain")}
    r = await client.post(f"/api/incidents/{inc['id']}/attachments", files=files, headers=AGENT_H)
    assert r.status_code == 201
    body = r.json()
    assert body["mime_type"] == "text/plain"
    assert body["size_bytes"] == 11
