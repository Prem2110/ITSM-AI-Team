"""Read-only HANA inspection script.

Loads backend/.env.hana, connects to the HDI schema, lists all tables with
row counts, and checks for naming collisions with the ITSM tables.

Run from backend/:
    uv run python scripts/inspect_hana.py
"""
from __future__ import annotations
import os
import sys
from pathlib import Path

# ── Load .env.hana ────────────────────────────────────────────────────────────

env_file = Path(__file__).parent.parent / ".env.hana"
if not env_file.exists():
    sys.exit(f"ERROR: {env_file} not found — create it first (see README / CLAUDE.md).")

env: dict[str, str] = {}
for line in env_file.read_text().splitlines():
    line = line.strip()
    if not line or line.startswith("#"):
        continue
    if "=" not in line:
        continue
    key, _, value = line.partition("=")
    env[key.strip()] = value.strip()

def req(key: str) -> str:
    v = env.get(key, "")
    if not v:
        sys.exit(f"ERROR: {key} is missing or empty in .env.hana")
    return v

address  = req("HANA_ADDRESS")
port     = int(req("HANA_PORT"))
user     = req("HANA_USER")
password = req("HANA_PASSWORD")
schema   = req("HANA_SCHEMA")
encrypt  = env.get("HANA_ENCRYPT", "true").lower() == "true"
ssl_val  = env.get("HANA_SSL_VALIDATE", "false").lower() == "true"

# ── Connect ───────────────────────────────────────────────────────────────────

try:
    from hdbcli import dbapi  # type: ignore[import]
except ModuleNotFoundError:
    sys.exit(
        "ERROR: hdbcli not installed.\n"
        "Add it: uv add hdbcli   (or: pip install hdbcli)"
    )

print(f"Connecting to {address}:{port} schema={schema} …", flush=True)

try:
    conn = dbapi.connect(
        address=address,
        port=port,
        user=user,
        password=password,
        encrypt=encrypt,
        sslValidateCertificate=ssl_val,
    )
except Exception as exc:
    sys.exit(f"ERROR: connection failed — {exc}")

print("Connected.\n")

# ── List tables ───────────────────────────────────────────────────────────────

cursor = conn.cursor()

# SYS.TABLES is readable by any user who can connect
cursor.execute(
    "SELECT TABLE_NAME FROM SYS.TABLES WHERE SCHEMA_NAME = ? ORDER BY TABLE_NAME",
    (schema,),
)
rows = cursor.fetchall()

if not rows:
    print(f"No tables found in schema {schema!r}.")
    print("Either the schema is empty, or this user lacks SELECT on SYS.TABLES.")
    conn.close()
    sys.exit(0)

table_names: list[str] = [r[0] for r in rows]

print(f"{'TABLE':<50}  {'ROWS':>10}")
print("-" * 63)

counts: dict[str, int] = {}
for name in table_names:
    try:
        cursor.execute(f'SELECT COUNT(*) FROM "{schema}"."{name}"')
        count: int = cursor.fetchone()[0]
    except Exception:
        count = -1  # no SELECT privilege on this table
    counts[name] = count
    count_str = str(count) if count >= 0 else "(no access)"
    print(f"  {name:<48}  {count_str:>10}")

print()

# ── Collision check ───────────────────────────────────────────────────────────

prefix = env.get("TABLE_PREFIX", "")
BASE_TABLES = ["users", "incidents", "incident_events", "attachments", "alembic_version"]
OUR_TABLES = {f"{prefix}{t}" for t in BASE_TABLES}
existing_lower = {n.lower() for n in table_names}
collisions = {t for t in OUR_TABLES if t.lower() in existing_lower}

if prefix:
    print(f"Checking for prefixed table collisions (TABLE_PREFIX={prefix!r}) …")
    # With a prefix set, bare-name tables from other projects are not our concern.
    # Only report if our *prefixed* tables already exist (means migration ran — expected).
    if collisions:
        print(f"  Prefixed tables already exist (migration ran): {', '.join(sorted(collisions))}")
    else:
        targets = ", ".join(f"{prefix}{t}" for t in ["users", "incidents", "incident_events", "attachments"])
        print(f"  No collisions — safe to create: {targets}")
else:
    print("Checking for table collisions (no TABLE_PREFIX set) …")
    if collisions:
        print("!! COLLISION DETECTED — the following ITSM table names already exist in this schema:")
        for name in sorted(collisions):
            print(f"   • {name}")
        print()
        print("Stop here and set TABLE_PREFIX or request a dedicated schema before running migrations.")
    else:
        print("No collisions — ITSM tables (users, incidents, incident_events, attachments) are safe to create.")

cursor.close()
conn.close()
