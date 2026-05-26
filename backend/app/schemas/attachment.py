from __future__ import annotations
from datetime import datetime
from pydantic import BaseModel


class AttachmentCreate(BaseModel):
    incident_id: str
    filename: str
    mime_type: str
    size_bytes: int
    blob_ref: str
    uploaded_by: str


class AttachmentResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    incident_id: str
    filename: str
    mime_type: str
    size_bytes: int
    blob_ref: str
    uploaded_by: str
    uploaded_at: datetime
