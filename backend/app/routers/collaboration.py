from __future__ import annotations
import json
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from ..db import AsyncSessionLocal
from ..config import env_settings
from ..repositories.user_repository import UserRepository
from ..auth.context import CallerContext

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/incidents", tags=["collaboration"])

_ROLE_SCOPES: dict[str, list[str]] = {
    "requester": ["TicketRead", "TicketWrite"],
    "agent": ["TicketRead", "TicketWrite", "Agent"],
    "admin": ["TicketRead", "TicketWrite", "Agent", "Admin"],
}

_PRESENCE_COLORS = [
    "#6366f1", "#ec4899", "#14b8a6", "#f97316",
    "#8b5cf6", "#10b981", "#ef4444", "#3b82f6",
]


def _color_for_user(user_id: str) -> str:
    return _PRESENCE_COLORS[abs(hash(user_id)) % len(_PRESENCE_COLORS)]


class CollaborationManager:
    """In-memory presence and field-lock state. Single shared instance."""

    def __init__(self) -> None:
        # incident_id -> { user_id -> { ws, name, color, editing_field } }
        self._rooms: dict[str, dict[str, dict]] = {}

    def _room(self, incident_id: str) -> dict[str, dict]:
        return self._rooms.setdefault(incident_id, {})

    async def connect(self, incident_id: str, caller: CallerContext, ws: WebSocket) -> None:
        await ws.accept()
        color = _color_for_user(caller.user_id)
        room = self._room(incident_id)

        # Send full presence snapshot to the joining connection
        snapshot = [
            {"user_id": uid, "name": m["name"], "color": m["color"], "editing_field": m["editing_field"]}
            for uid, m in room.items()
        ]
        await ws.send_text(json.dumps({"type": "presence", "users": snapshot}))

        # Register
        room[caller.user_id] = {"ws": ws, "name": caller.name, "color": color, "editing_field": None}

        # Broadcast join to others
        await self._broadcast(incident_id, {
            "type": "join",
            "user_id": caller.user_id,
            "name": caller.name,
            "color": color,
        }, exclude=caller.user_id)

        logger.info("collab: %s joined incident %s (%d in room)", caller.name, incident_id, len(room))

    async def disconnect(self, incident_id: str, user_id: str) -> None:
        room = self._rooms.get(incident_id, {})
        member = room.pop(user_id, None)
        if member is None:
            return

        msgs = [{"type": "leave", "user_id": user_id}]
        if member.get("editing_field"):
            msgs.append({"type": "field_unlock", "user_id": user_id, "field": member["editing_field"]})

        for msg in msgs:
            await self._broadcast(incident_id, msg)

        if not room:
            self._rooms.pop(incident_id, None)

        logger.info("collab: user %s left incident %s", user_id[:8], incident_id)

    async def handle_message(self, incident_id: str, user_id: str, raw: str) -> None:
        try:
            msg = json.loads(raw)
        except (json.JSONDecodeError, ValueError):
            return

        room = self._rooms.get(incident_id, {})
        member = room.get(user_id)
        if member is None:
            return

        msg_type = msg.get("type")

        if msg_type == "field_lock":
            field = str(msg.get("field", ""))
            member["editing_field"] = field
            await self._broadcast(incident_id, {
                "type": "field_lock",
                "user_id": user_id,
                "name": member["name"],
                "color": member["color"],
                "field": field,
            }, exclude=user_id)

        elif msg_type == "field_unlock":
            member["editing_field"] = None
            await self._broadcast(incident_id, {
                "type": "field_unlock",
                "user_id": user_id,
                "field": str(msg.get("field", "")),
            }, exclude=user_id)

    async def _broadcast(self, incident_id: str, msg: dict, exclude: str | None = None) -> None:
        room = self._rooms.get(incident_id, {})
        text = json.dumps(msg)
        dead: list[str] = []
        for uid, member in list(room.items()):
            if uid == exclude:
                continue
            try:
                await member["ws"].send_text(text)
            except Exception:
                dead.append(uid)
        for uid in dead:
            room.pop(uid, None)


manager = CollaborationManager()


async def _authenticate_ws(websocket: WebSocket) -> CallerContext | None:
    """Authenticate a WebSocket connection. Uses a short-lived DB session (not Depends)."""
    if env_settings.auth_mode != "fake":
        # XSUAA WebSocket auth not yet supported
        return None
    email = websocket.query_params.get("email")
    if not email:
        return None
    async with AsyncSessionLocal() as session:
        user = await UserRepository(session).get_by_email(email)
    if user is None:
        return None
    scopes = _ROLE_SCOPES.get(user.role, [])
    return CallerContext(user_id=user.id, email=user.email, name=user.name, scopes=scopes)


@router.websocket("/{incident_id}/collaboration")
async def ws_collaboration(incident_id: str, websocket: WebSocket) -> None:
    caller = await _authenticate_ws(websocket)
    if caller is None or "TicketRead" not in (caller.scopes or []):
        await websocket.accept()
        await websocket.close(code=4001, reason="Unauthorized")
        return

    await manager.connect(incident_id, caller, websocket)
    try:
        while True:
            data = await websocket.receive_text()
            await manager.handle_message(incident_id, caller.user_id, data)
    except WebSocketDisconnect:
        pass
    finally:
        await manager.disconnect(incident_id, caller.user_id)
