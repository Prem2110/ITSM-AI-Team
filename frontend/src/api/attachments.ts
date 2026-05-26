import client from './client'
import type { Attachment } from '@/types'

export async function uploadAttachment(incidentId: string, file: File): Promise<Attachment> {
  const form = new FormData()
  form.append('file', file)
  const { data } = await client.post(`/incidents/${incidentId}/attachments`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export function downloadAttachmentUrl(incidentId: string, attachmentId: string): string {
  return `/api/incidents/${incidentId}/attachments/${attachmentId}`
}

export async function deleteAttachment(incidentId: string, attachmentId: string): Promise<void> {
  await client.delete(`/incidents/${incidentId}/attachments/${attachmentId}`)
}
