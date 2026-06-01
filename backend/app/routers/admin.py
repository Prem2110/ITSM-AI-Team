from __future__ import annotations
import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, text
from sqlalchemy.ext.asyncio import AsyncSession
from ..db import get_db, SyncToAsyncSessionBridge
from ..auth.permissions import require_scope
from ..auth.context import CallerContext
from ..models.incident import Incident
from ..models.incident_event import IncidentEvent
from ..models.attachment import Attachment
from ..models.user import User
from ..models.app_settings import AppSettings
from ..config import tbl

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/admin", tags=["admin"])


async def _reset_sequence(session) -> None:
    """Reset the incident number sequence on HANA. No-op on SQLite."""
    if not isinstance(session, SyncToAsyncSessionBridge):
        return
    seq = tbl("INC_SEQ")
    try:
        await session.execute(text(f'DROP SEQUENCE "{seq}"'))
        await session.execute(
            text(f'CREATE SEQUENCE "{seq}" START WITH 1 INCREMENT BY 1 NO CYCLE')
        )
        logger.info("admin: sequence %s reset to 1", seq)
    except Exception as exc:
        logger.warning("admin: could not reset sequence %s — %s", seq, exc)


@router.post("/reset-data")
async def reset_data(
    caller: CallerContext = require_scope("Admin"),
    session: AsyncSession = Depends(get_db),
) -> dict:
    """Delete all incidents, events and attachments. Keep users and app settings."""
    r_events = await session.execute(delete(IncidentEvent))
    r_attach = await session.execute(delete(Attachment))
    r_inc    = await session.execute(delete(Incident))
    await _reset_sequence(session)
    logger.info(
        "admin.reset-data: caller=%s deleted events=%d attachments=%d incidents=%d",
        caller.email, r_events.rowcount, r_attach.rowcount, r_inc.rowcount,
    )
    return {
        "deleted": {
            "incidents": r_inc.rowcount,
            "events": r_events.rowcount,
            "attachments": r_attach.rowcount,
        }
    }


@router.post("/factory-reset")
async def factory_reset(
    caller: CallerContext = require_scope("Admin"),
    session: AsyncSession = Depends(get_db),
) -> dict:
    """Delete everything — incidents, events, attachments, users, app settings.
    The app will return to the setup wizard on the next visit."""
    r_events   = await session.execute(delete(IncidentEvent))
    r_attach   = await session.execute(delete(Attachment))
    r_inc      = await session.execute(delete(Incident))
    r_users    = await session.execute(delete(User))
    r_settings = await session.execute(delete(AppSettings))
    await _reset_sequence(session)
    logger.info(
        "admin.factory-reset: caller=%s deleted incidents=%d users=%d settings=%d",
        caller.email, r_inc.rowcount, r_users.rowcount, r_settings.rowcount,
    )
    return {
        "deleted": {
            "incidents": r_inc.rowcount,
            "events": r_events.rowcount,
            "attachments": r_attach.rowcount,
            "users": r_users.rowcount,
            "settings": r_settings.rowcount,
        }
    }
