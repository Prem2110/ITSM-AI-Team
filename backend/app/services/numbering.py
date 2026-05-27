from __future__ import annotations
import logging
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession
from ..models.incident import Incident
from ..config import app_config, tbl
from ..db import SyncToAsyncSessionBridge

logger = logging.getLogger(__name__)


async def next_incident_number(session: AsyncSession) -> str:
    """Return the next incident number string (e.g. 'INC0000042').

    SQLite: MAX(number) + 1 inside the current transaction.
    HANA:   DB sequence {tbl('INC_SEQ')} created by the initial migration.
    """
    prefix = app_config.number_prefix

    if isinstance(session, SyncToAsyncSessionBridge):
        seq_name = tbl("INC_SEQ")
        result = await session.execute(text(f"SELECT {seq_name}.NEXTVAL FROM DUMMY"))
        n: int = result.scalar_one()
        logger.debug("numbering: HANA sequence %s -> %d", seq_name, n)
    else:
        result = await session.execute(select(func.max(Incident.number)))
        max_num: str | None = result.scalar_one_or_none()
        if max_num is None:
            n = 1
        else:
            n = int(max_num[len(prefix):]) + 1
        logger.debug("numbering: SQLite MAX -> %d", n)

    number = f"{prefix}{n:07d}"
    logger.debug("numbering: assigned %s", number)
    return number
