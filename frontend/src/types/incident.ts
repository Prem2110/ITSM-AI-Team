export type IncidentState =
  | 'new'
  | 'assigned'
  | 'in_progress'
  | 'on_hold'
  | 'resolved'
  | 'closed'

export type IncidentSource = 'web' | 'email' | 'classifier_escalation' | 'fix_failed_escalation'

export interface IncidentListItem {
  id: string
  number: string
  title: string
  state: IncidentState
  priority: 1 | 2 | 3 | 4
  category: string
  assignee_id: string | null
  assignee_name: string | null
  sla_breached: boolean
  created_at: string
  updated_at: string
}

export interface IncidentListResponse {
  items: IncidentListItem[]
  total: number
  page: number
  page_size: number
}

export interface Incident {
  id: string
  number: string
  title: string
  description: string
  state: IncidentState
  priority: 1 | 2 | 3 | 4
  category: string
  source: IncidentSource
  requester_id: string
  assignee_id: string | null
  resolution_code: string | null
  resolution_notes: string | null
  sla_resolution_due: string | null
  sla_breached: boolean
  created_at: string
  updated_at: string
  resolved_at: string | null
  closed_at: string | null
}

export interface IncidentDetail extends Incident {
  requester: import('./user').User
  assignee: import('./user').User | null
  events: import('./event').IncidentEvent[]
}

export interface IncidentCreateRequest {
  title: string
  description: string
  priority: number
  category: string
  source?: string
  assignee_id?: string | null
  requester_id?: string | null
}

export interface IncidentPatchRequest {
  title?: string
  description?: string
  priority?: number
  category?: string
  assignee_id?: string | null
}

export interface TransitionRequest {
  to_state: IncidentState
  resolution_code?: string
  resolution_notes?: string
}

export interface IncidentFilters {
  state?: string
  priority?: number
  assignee_id?: string
  requester_id?: string
  q?: string
  category?: string
  sort?: string
  order?: 'asc' | 'desc'
  page?: number
  page_size?: number
}
