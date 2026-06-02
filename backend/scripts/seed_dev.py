"""Dev seed script — inserts sample users, incidents, events, and one attachment.
Run from backend/: uv run python scripts/seed_dev.py
"""
from __future__ import annotations
import asyncio
import uuid
from datetime import timedelta

from app.db import AsyncSessionLocal
from app.models.user import User
from app.models.incident import Incident
from app.models.incident_event import IncidentEvent
from app.models.attachment import Attachment
from app.services.numbering import next_incident_number
from app.config import app_config
from app.utils import utcnow


async def seed() -> None:
    from sqlalchemy import select
    async with AsyncSessionLocal() as session:
        async with session.begin():
            existing = await session.scalar(select(User).where(User.email == "karthik.byju@sierradigital.com"))
            if existing:
                print("Seed data already present — skipping.")
                return
            # --- Users ---
            admin = User(
                id=str(uuid.uuid4()),
                email="karthik.byju@sierradigital.com",
                name="Karthik Byju",
                role="admin",
            )
            agent = User(
                id=str(uuid.uuid4()),
                email="prem@sierradigital.com",
                name="Prem",
                role="agent",
            )
            requester = User(
                id=str(uuid.uuid4()),
                email="ashok@sierradigital.com",
                name="Ashok",
                role="requester",
            )
            session.add_all([admin, agent, requester])
            await session.flush()

            # --- Incidents ---
            async def make_incident(title, description, priority, category, source, state, assignee=None):
                now = utcnow()
                number = await next_incident_number(session)
                sla_hours = app_config.priorities[priority - 1].sla_hours
                inc = Incident(
                    id=str(uuid.uuid4()),
                    number=number,
                    title=title,
                    description=description,
                    state=state,
                    priority=priority,
                    category=category,
                    source=source,
                    requester_id=requester.id,
                    assignee_id=assignee.id if assignee else None,
                    sla_resolution_due=now + timedelta(hours=sla_hours),
                    created_at=now,
                    updated_at=now,
                )
                session.add(inc)
                await session.flush()
                return inc

            inc1 = await make_incident(
                "VPN not connecting",
                "Since yesterday morning I cannot connect to the corporate VPN. Error: 'Connection timed out'.",
                priority=2, category="Network", source="web", state="assigned", assignee=agent,
            )
            inc2 = await make_incident(
                "Outlook crashes on startup",
                "Outlook 365 crashes immediately when launched. Happens on my laptop and my desk machine.",
                priority=3, category="Software", source="web", state="in_progress", assignee=agent,
            )
            inc3 = await make_incident(
                "Cannot access SAP S/4HANA after password reset",
                "My SAP account is locked after a forced password reset. IT reset it but I still cannot log in.",
                priority=1, category="SAP Integration", source="email", state="new",
            )
            inc4 = await make_incident(
                "Laptop keyboard unresponsive",
                "Several keys on my laptop keyboard stopped working after a coffee spill.",
                priority=3, category="Hardware", source="web", state="resolved", assignee=agent,
            )
            inc5 = await make_incident(
                "Printer offline in Building A",
                "The HP LaserJet on the 3rd floor shows offline. Multiple people affected.",
                priority=4, category="Hardware", source="web", state="closed",
            )

            # Update resolved/closed timestamps for inc4 and inc5
            inc4.resolution_code = "hardware_replaced"
            inc4.resolution_notes = "Keyboard replaced under warranty. User confirmed working."
            inc4.resolved_at = utcnow() - timedelta(hours=2)
            inc5.resolution_code = "configuration_change"
            inc5.resolution_notes = "Printer driver updated and print spooler restarted."
            inc5.resolved_at = utcnow() - timedelta(days=1)
            inc5.closed_at = utcnow() - timedelta(hours=20)

            await session.flush()

            # --- Events ---
            async def add_event(incident, actor, event_type, body, metadata=None):
                ev = IncidentEvent(
                    id=str(uuid.uuid4()),
                    incident_id=incident.id,
                    actor_id=actor.id,
                    event_type=event_type,
                    body=body,
                    event_metadata=metadata,
                )
                session.add(ev)
                await session.flush()
                return ev

            # inc1 events
            await add_event(inc1, requester, "comment", "Still not working. Tried restarting my machine.")
            await add_event(inc1, agent, "state_change", "Assigned to myself, will investigate.",
                            {"from_state": "new", "to_state": "assigned"})
            await add_event(inc1, agent, "work_note", "Checked firewall rules. No recent changes. Escalating to network team.")

            # inc2 events
            await add_event(inc2, requester, "comment", "It also crashes when I try to open it in safe mode.")
            await add_event(inc2, agent, "state_change", "Started investigation.",
                            {"from_state": "assigned", "to_state": "in_progress"})
            await add_event(inc2, agent, "work_note", "Office repair tool running. Will update when complete.")

            # inc3 events
            await add_event(inc3, requester, "comment", "This is urgent — I cannot process invoices without SAP access.")

            # inc4 events
            await add_event(inc4, agent, "state_change", "Resolved — keyboard replaced.",
                            {"from_state": "in_progress", "to_state": "resolved"})
            await add_event(inc4, requester, "comment", "Confirmed working, thank you!")

            # inc5 events
            await add_event(inc5, agent, "state_change", "Resolved.",
                            {"from_state": "in_progress", "to_state": "resolved"})
            await add_event(inc5, admin, "state_change", "Closed after 24-hour verification period.",
                            {"from_state": "resolved", "to_state": "closed"})

            # --- One Attachment ---
            att = Attachment(
                id=str(uuid.uuid4()),
                incident_id=inc1.id,
                filename="vpn_error_screenshot.png",
                mime_type="image/png",
                size_bytes=87432,
                blob_ref="./uploads/vpn_error_screenshot.png",
                uploaded_by=requester.id,
            )
            session.add(att)
            await session.flush()

    print("Seed complete.")
    print(f"  Users:    3  (karthik.byju@sierradigital.com, prem@sierradigital.com, ashok@sierradigital.com)")
    print(f"  Incidents: 5  ({inc1.number} … {inc5.number})")
    print(f"  Events:   11")
    print(f"  Attachments: 1  (on {inc1.number})")


if __name__ == "__main__":
    asyncio.run(seed())
