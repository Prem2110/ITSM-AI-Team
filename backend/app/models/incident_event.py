from __future__ import annotations
import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, Text, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column
from ..db import Base
from ..config import tbl
from ..utils import utcnow
from ..types import JSONText


class IncidentEvent(Base):
    __tablename__ = tbl("incident_events")
    __table_args__ = (
        Index(f"ix_{tbl('incident_events')}_incident_created", "incident_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    incident_id: Mapped[str] = mapped_column(String(36), ForeignKey(tbl("incidents") + ".id"), nullable=False)
    actor_id: Mapped[str] = mapped_column(String(36), ForeignKey(tbl("users") + ".id"), nullable=False)
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    event_metadata: Mapped[dict | None] = mapped_column("metadata", JSONText, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
