from __future__ import annotations
from fastapi import APIRouter
from ..auth.permissions import require_scope
from ..auth.context import CallerContext
from ..config import app_config

router = APIRouter(prefix="/api/config", tags=["config"])


@router.get("/priorities")
async def get_priorities(caller: CallerContext = require_scope("TicketRead")) -> list[dict]:
    return [
        {"level": i + 1, "name": p.name, "color": p.color, "sla_hours": p.sla_hours}
        for i, p in enumerate(app_config.priorities)
    ]


@router.get("/categories")
async def get_categories(caller: CallerContext = require_scope("TicketRead")) -> list[str]:
    return app_config.categories


@router.get("/states")
async def get_states(caller: CallerContext = require_scope("TicketRead")) -> dict:
    return {
        "states": app_config.states,
        "transitions": app_config.state_transitions,
    }
