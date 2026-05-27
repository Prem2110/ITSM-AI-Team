from __future__ import annotations
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from ..models.app_settings import AppSettings
from ..utils import utcnow


class AppSettingsRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get(self) -> AppSettings | None:
        result = await self.session.execute(
            select(AppSettings).where(AppSettings.id == "singleton")
        )
        return result.scalar_one_or_none()

    async def create(self, data: dict) -> AppSettings:
        settings = AppSettings(id="singleton", **data)
        self.session.add(settings)
        await self.session.flush()
        return settings

    async def update(self, fields: dict) -> AppSettings | None:
        settings = await self.get()
        if settings is None:
            return None
        for k, v in fields.items():
            setattr(settings, k, v)
        settings.updated_at = utcnow()
        await self.session.flush()
        return settings
