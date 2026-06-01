from __future__ import annotations
import logging
import uuid
from pathlib import Path
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from ..db import get_db
from ..auth.permissions import require_scope
from ..auth.context import CallerContext
from ..repositories.incident_repository import IncidentRepository
from ..repositories.attachment_repository import AttachmentRepository
from ..repositories.incident_event_repository import IncidentEventRepository
from ..schemas.attachment import AttachmentCreate, AttachmentResponse
from ..schemas.incident_event import IncidentEventCreate

_UPLOAD_DIR = Path("uploads")
_MAX_BYTES = 20 * 1024 * 1024
_CHUNK_BYTES = 1024 * 1024
_ALLOWED_MIME_TYPES = frozenset({
    "text/plain",
    "application/pdf",
    "image/png",
    "image/jpeg",
    "application/json",
    "application/zip",
})

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/incidents/{incident_id}/attachments", tags=["attachments"])


@router.post("", response_model=AttachmentResponse, status_code=201)
async def upload_attachment(
    incident_id: str,
    file: UploadFile = File(...),
    caller: CallerContext = require_scope("TicketWrite"),
    session: AsyncSession = Depends(get_db),
):
    incident = await IncidentRepository(session).get_by_id(incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    mime_type = (file.content_type or "application/octet-stream").lower()
    if mime_type not in _ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type: {mime_type}",
        )

    file_uuid = str(uuid.uuid4())
    dest_dir = _UPLOAD_DIR / incident_id
    dest_dir.mkdir(parents=True, exist_ok=True)
    safe_filename = f"{file_uuid}_{Path(file.filename or 'upload').name}"
    dest_path = dest_dir / safe_filename
    size_bytes = 0
    try:
        with dest_path.open("wb") as out:
            while True:
                chunk = await file.read(_CHUNK_BYTES)
                if not chunk:
                    break
                size_bytes += len(chunk)
                if size_bytes > _MAX_BYTES:
                    logger.warning(
                        "attachment.upload rejected incident_id=%s user_id=%s reason=size_limit",
                        incident_id,
                        caller.user_id,
                    )
                    raise HTTPException(status_code=413, detail="File exceeds 20 MB limit")
                out.write(chunk)
    except HTTPException:
        if dest_path.exists():
            dest_path.unlink()
        raise

    att = await AttachmentRepository(session).create(AttachmentCreate(
        incident_id=incident_id,
        filename=file.filename or "upload",
        mime_type=mime_type,
        size_bytes=size_bytes,
        blob_ref=str(dest_path),
        uploaded_by=caller.user_id,
    ))

    await IncidentEventRepository(session).create(IncidentEventCreate(
        incident_id=incident_id,
        actor_id=caller.user_id,
        event_type="attachment_added",
        body=None,
        event_metadata={"filename": file.filename, "size_bytes": size_bytes},
    ))

    return AttachmentResponse.model_validate(att)


@router.get("/{attachment_id}")
async def download_attachment(
    incident_id: str,
    attachment_id: str,
    caller: CallerContext = require_scope("TicketRead"),
    session: AsyncSession = Depends(get_db),
):
    att = await AttachmentRepository(session).get_by_id(attachment_id)
    if att is None or att.incident_id != incident_id:
        raise HTTPException(status_code=404, detail="Attachment not found")
    path = Path(att.blob_ref)
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")
    return FileResponse(path=str(path), filename=att.filename, media_type=att.mime_type)


@router.delete("/{attachment_id}", status_code=204)
async def delete_attachment(
    incident_id: str,
    attachment_id: str,
    caller: CallerContext = require_scope("Agent"),
    session: AsyncSession = Depends(get_db),
):
    att_repo = AttachmentRepository(session)
    att = await att_repo.get_by_id(attachment_id)
    if att is None or att.incident_id != incident_id:
        raise HTTPException(status_code=404, detail="Attachment not found")

    path = Path(att.blob_ref)
    if path.exists():
        path.unlink()

    await att_repo.delete(attachment_id)

    await IncidentEventRepository(session).create(IncidentEventCreate(
        incident_id=incident_id,
        actor_id=caller.user_id,
        event_type="attachment_deleted",
        body=None,
        event_metadata={"filename": att.filename},
    ))
