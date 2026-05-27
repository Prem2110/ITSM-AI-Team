from __future__ import annotations
import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from ..models.attachment import Attachment
from ..schemas.attachment import AttachmentCreate


class AttachmentRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(self, data: AttachmentCreate) -> Attachment:
        att = Attachment(
            id=str(uuid.uuid4()),
            incident_id=data.incident_id,
            filename=data.filename,
            mime_type=data.mime_type,
            size_bytes=data.size_bytes,
            blob_ref=data.blob_ref,
            uploaded_by=data.uploaded_by,
        )
        self.session.add(att)
        return att

    async def list_for_incident(self, incident_id: str) -> list[Attachment]:
        result = await self.session.execute(
            select(Attachment)
            .where(Attachment.incident_id == incident_id)
            .order_by(Attachment.uploaded_at.asc())
        )
        return list(result.scalars().all())

    async def get_by_id(self, attachment_id: str) -> Attachment | None:
        result = await self.session.execute(
            select(Attachment).where(Attachment.id == attachment_id)
        )
        return result.scalar_one_or_none()

    async def delete(self, attachment_id: str) -> bool:
        att = await self.get_by_id(attachment_id)
        if att is None:
            return False
        await self.session.delete(att)
        await self.session.flush()
        return True
