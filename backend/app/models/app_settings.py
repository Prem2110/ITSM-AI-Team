from __future__ import annotations
from datetime import datetime
import sqlalchemy as sa
from sqlalchemy import String, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from ..db import Base
from ..config import tbl
from ..types import JSONText
from ..utils import utcnow


class AppSettings(Base):
    __tablename__ = tbl("app_settings")

    id: Mapped[str] = mapped_column(String(16), primary_key=True, default=lambda: "singleton")
    company_name: Mapped[str] = mapped_column(String(255), nullable=False)
    timezone: Mapped[str] = mapped_column(String(100), nullable=False)
    sla_targets: Mapped[dict | None] = mapped_column(JSONText, nullable=True)
    resolution_codes: Mapped[list | None] = mapped_column(JSONText, nullable=True)
    setup_completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    setup_completed_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    categories: Mapped[list | None] = mapped_column(JSONText, nullable=True)
    sources: Mapped[list | None] = mapped_column(JSONText, nullable=True)
    ai_enabled: Mapped[int] = mapped_column(sa.SmallInteger(), nullable=True, default=0)
    openrouter_api_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    openrouter_model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)
