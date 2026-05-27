from __future__ import annotations
import json
from sqlalchemy import Text
from sqlalchemy.types import TypeDecorator


class JSONText(TypeDecorator):
    """JSON stored as Text — works on both SQLite and SAP HANA (which maps JSON to NCLOB).

    Stores dicts/lists as JSON strings; returns them as parsed Python objects.
    Accepts already-deserialized dicts/lists gracefully on result processing.
    """
    impl = Text
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        return json.dumps(value, ensure_ascii=False)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, (dict, list)):
            return value  # already deserialized (some DBAPI drivers do this)
        return json.loads(value)
