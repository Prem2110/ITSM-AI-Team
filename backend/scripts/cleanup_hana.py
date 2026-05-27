"""One-time cleanup of failed migration state from HANA. DELETE AFTER USE."""
import os
from dotenv import load_dotenv
from hdbcli import dbapi

load_dotenv(".env.hana")

conn = dbapi.connect(
    address=os.environ["HANA_ADDRESS"],
    port=int(os.environ["HANA_PORT"]),
    user=os.environ["HANA_USER"],
    password=os.environ["HANA_PASSWORD"],
    encrypt=True,
)
cur = conn.cursor()

# Drop alembic_version if it exists from the failed run
try:
    cur.execute('DROP TABLE "alembic_version"')
    print("Dropped alembic_version")
except Exception as e:
    print(f"alembic_version drop skipped: {e}")

# Drop any ITSMAI_* tables that may have been partially created
prefix = os.environ.get("TABLE_PREFIX", "ITSMAI_")
for table in ["users", "incidents", "incident_events", "attachments"]:
    name = prefix + table
    try:
        cur.execute(f'DROP TABLE "{name}"')
        print(f"Dropped {name}")
    except Exception as e:
        print(f"{name} drop skipped: {e}")

# Drop the sequence
try:
    cur.execute(f'DROP SEQUENCE "{prefix}INC_SEQ"')
    print(f"Dropped {prefix}INC_SEQ")
except Exception as e:
    print(f"{prefix}INC_SEQ drop skipped: {e}")

conn.commit()
print("Cleanup complete.")
