import client from './client'
import type { IncidentEvent, EventCreateRequest } from '@/types'

export interface EventListResponse {
  items: IncidentEvent[]
  total: number
  page: number
  page_size: number
}

export async function listEvents(incidentId: string, page = 1, pageSize = 50): Promise<EventListResponse> {
  const { data } = await client.get(`/incidents/${incidentId}/events`, {
    params: { page, page_size: pageSize },
  })
  return data
}

export async function createEvent(incidentId: string, payload: EventCreateRequest): Promise<IncidentEvent> {
  const { data } = await client.post(`/incidents/${incidentId}/events`, payload)
  return data
}
