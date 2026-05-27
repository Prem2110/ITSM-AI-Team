"""Drop all ITSM tables and ALEMBIC_VERSION from HANA, then run migrations fresh.

Usage:
    uv run python scripts/cleanup_hana.py
    uv run alembic upgrade head
"""
import os
import sys
sys.path.insert(0, ".")

from dotenv import load_dotenv
load_dotenv(".env.hana")

from app.db import resolve_database_url, _hana_connect_args
from sqlalchemy import create_engine, text

url = resolve_database_url()
if "hana" not in url and "hdbcli" not in url:
    print("Not a HANA database — aborting (check .env.hana)")
    sys.exit(1)

engine = create_engine(url, connect_args=_hana_connect_args())
prefix = os.environ.get("TABLE_PREFIX", "ITSMAI_")

TABLES = [
    f"{prefix}app_settings",
    f"{prefix}incident_events",
    f"{prefix}attachments",
    f"{prefix}incidents",
    f"{prefix}users",
]

SEQUENCES = [f"{prefix}INC_SEQ"]

VERSION_TABLES = ["ALEMBIC_VERSION", "alembic_version"]

with engine.connect() as conn:
    for tname in TABLES:
        try:
            conn.execute(text(f'DROP TABLE "{tname}"'))
            conn.commit()
            print(f"Dropped table {tname}")
        except Exception as e:
            conn.rollback()
            print(f"Skip {tname}: {e}")

    for seq in SEQUENCES:
        try:
            conn.execute(text(f'DROP SEQUENCE "{seq}"'))
            conn.commit()
            print(f"Dropped sequence {seq}")
        except Exception as e:
            conn.rollback()
            print(f"Skip sequence {seq}: {e}")

    for vtbl in VERSION_TABLES:
        try:
            conn.execute(text(f'DROP TABLE {vtbl}'))
            conn.commit()
            print(f"Dropped {vtbl}")
            break
        except Exception as e:
            conn.rollback()
            print(f"Skip {vtbl}: {e}")

print("\nCleanup complete. Now run: uv run alembic upgrade head")
