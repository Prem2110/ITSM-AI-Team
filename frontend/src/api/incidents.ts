import client from './client'
import type { IncidentListResponse, IncidentDetail, Incident, IncidentFilters, IncidentCreateRequest, IncidentPatchRequest, TransitionRequest } from '@/types'

export async function listIncidents(filters: IncidentFilters = {}): Promise<IncidentListResponse> {
  const { data } = await client.get('/incidents', { params: filters })
  return data
}

export async function getIncident(id: string): Promise<IncidentDetail> {
  const { data } = await client.get(`/incidents/${id}`)
  return data
}

export async function createIncident(payload: IncidentCreateRequest): Promise<Incident> {
  const { data } = await client.post('/incidents', payload)
  return data
}

export async function patchIncident(id: string, payload: IncidentPatchRequest): Promise<Incident> {
  const { data } = await client.patch(`/incidents/${id}`, payload)
  return data
}

export async function transitionIncident(id: string, payload: TransitionRequest): Promise<Incident> {
  const { data } = await client.post(`/incidents/${id}/transition`, payload)
  return data
}
