from __future__ import annotations
import logging
from datetime import date
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession
from ..models.incident import Incident
from ..config import app_config, tbl
from ..db import SyncToAsyncSessionBridge

logger = logging.getLogger(__name__)


async def next_incident_number(session: AsyncSession) -> str:
    """Return the next incident number string (e.g. 'TCK-20260601-00001').

    Format: {prefix}-{YYYYMMDD}-{seq:05d} where seq is a global running counter.
    The date is embedded for readability; the sequence never resets across days.

    SQLite: derives next seq from MAX(number) in the current transaction.
    HANA:   uses DB sequence {tbl('INC_SEQ')} created by the initial migration.
    """
    prefix = app_config.number_prefix
    today = date.today().strftime("%Y%m%d")

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
            try:
                # New format: TCK-20260601-00042 → last segment → 42
                n = int(max_num.rsplit("-", 1)[-1]) + 1
            except (ValueError, IndexError):
                n = 1
        logger.debug("numbering: SQLite MAX -> %d", n)

    number = f"{prefix}-{today}-{n:05d}"
    logger.debug("numbering: assigned %s", number)
    return number
