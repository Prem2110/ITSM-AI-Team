import client from './client'

export interface AIStatus {
  ai_enabled: boolean
  model: string
  has_key: boolean
}

export interface SLARiskItem {
  id: string
  number: string
  title: string
  priority: number
  state: string
  sla_due: string | null
  sla_breached: boolean
  risk_score: number
}

export interface AnomalyItem {
  category: string
  recent_count: number
  expected_count: number
  ratio: number
  severity: 'critical' | 'high' | 'medium'
}

export interface ForecastData {
  historical_dates: string[]
  historical_counts: number[]
  forecast_dates: string[]
  forecast_counts: number[]
  trend: 'up' | 'down' | 'stable'
  slope: number
}

export interface AgentWorkloadItem {
  id: string
  name: string
  email: string
  open_count: number
  resolved_last_30d: number
  avg_hours_by_category: Record<string, number>
  overall_avg_hours: number
}

export interface ClassifyResult {
  priority: number
  category: string
  confidence: number
  reasoning: string
}

export interface SimilarIncident {
  id: string
  number: string
  title: string
  similarity_reason: string
  resolution_summary: string
}

export interface AISettingsPatch {
  ai_enabled?: number
  openrouter_api_key?: string
  openrouter_model?: string
}

export async function getAIStatus(): Promise<AIStatus> {
  const { data } = await client.get('/ai/status')
  return data
}

export async function patchAISettings(fields: AISettingsPatch): Promise<AIStatus> {
  const { data } = await client.patch('/ai/settings', fields)
  return data
}

export async function getSLARisk(): Promise<SLARiskItem[]> {
  const { data } = await client.get('/ai/sla-risk')
  return data
}

export async function getAnomalies(): Promise<AnomalyItem[]> {
  const { data } = await client.get('/ai/anomalies')
  return data
}

export async function getForecast(): Promise<ForecastData> {
  const { data } = await client.get('/ai/forecast')
  return data
}

export async function getAgentWorkload(): Promise<AgentWorkloadItem[]> {
  const { data } = await client.get('/ai/agent-workload')
  return data
}

export interface TestConnectionResult {
  ok: boolean
  model: string
  latency_ms: number
  response?: string
  error?: string
}

export async function testConnection(): Promise<TestConnectionResult> {
  const { data } = await client.post('/ai/test-connection', {})
  return data
}

export async function classifyIncident(title: string, description: string): Promise<ClassifyResult> {
  const { data } = await client.post('/ai/classify', { title, description })
  return data
}

export async function getSimilarIncidents(incidentId: string): Promise<SimilarIncident[]> {
  const { data } = await client.get(`/ai/incidents/${incidentId}/similar`)
  return data
}

export async function summarizeIncident(incidentId: string): Promise<{ summary: string }> {
  const { data } = await client.post(`/ai/incidents/${incidentId}/summarize`, {})
  return data
}

export async function draftReply(incidentId: string): Promise<{ draft: string }> {
  const { data } = await client.post(`/ai/incidents/${incidentId}/draft-reply`, {})
  return data
}

export async function draftResolution(incidentId: string): Promise<{ notes: string }> {
  const { data } = await client.post(`/ai/incidents/${incidentId}/draft-resolution`, {})
  return data
}

export async function generateHandoffReport(): Promise<{ report: string }> {
  const { data } = await client.post('/ai/handoff-report', {})
  return data
}
