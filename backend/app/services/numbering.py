from __future__ import annotations
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession
from ..models.incident import Incident
from ..config import app_config, env_settings, tbl


async def next_incident_number(session: AsyncSession) -> str:
    """Return the next incident number string (e.g. 'INC0000042').

    SQLite: MAX(number) + 1 inside the current transaction.
    HANA:   DB sequence {tbl('INC_SEQ')} created by the initial migration.
    """
    prefix = app_config.number_prefix
    db_url = env_settings.database_url.lower()

    if "hana" in db_url or "hdbcli" in db_url:
        seq_name = tbl("INC_SEQ")
        result = await session.execute(text(f"SELECT {seq_name}.NEXTVAL FROM DUMMY"))
        n: int = result.scalar_one()
    else:
        result = await session.execute(select(func.max(Incident.number)))
        max_num: str | None = result.scalar_one_or_none()
        if max_num is None:
            n = 1
        else:
            n = int(max_num[len(prefix):]) + 1

    return f"{prefix}{n:07d}"
