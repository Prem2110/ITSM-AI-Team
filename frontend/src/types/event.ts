export type EventType =
  | 'comment'
  | 'work_note'
  | 'state_change'
  | 'field_update'
  | 'assignment'
  | 'attachment_added'
  | 'attachment_deleted'

export interface IncidentEvent {
  id: string
  incident_id: string
  actor_id: string
  event_type: EventType
  body: string | null
  event_metadata: Record<string, unknown> | null
  created_at: string
}

export interface EventCreateRequest {
  event_type: 'comment' | 'work_note'
  body: string
}
