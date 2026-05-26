export interface Attachment {
  id: string
  incident_id: string
  filename: string
  mime_type: string
  size_bytes: number
  blob_ref: string
  uploaded_by: string
  created_at: string
}
