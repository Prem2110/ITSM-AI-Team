from __future__ import annotations
from datetime import datetime, timezone


def utcnow() -> datetime:
    """Return the current UTC time as a timezone-aware datetime."""
    return datetime.now(timezone.utc)


def naive_utc(dt: datetime | None) -> datetime | None:
    """Strip timezone info for safe arithmetic with HANA datetimes (which are tz-naive)."""
    if dt is None:
        return None
    return dt.replace(tzinfo=None) if dt.tzinfo else dt
