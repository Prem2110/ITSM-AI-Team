import client from './client'

export interface DashboardSummary {
  my_open: number
  all_open: number
  unassigned: number
  breached: number
  by_state: Record<string, number>
  by_priority: Record<string, number>
}

export interface DashboardTrends {
  dates: string[]
  new_counts: number[]
  resolved_counts: number[]
}

export interface DashboardSlaCompliance {
  compliance_pct: number
  met: number
  total: number
}

export interface DashboardTopCategory {
  category: string
  count: number
}

export interface DashboardOpsKpis {
  avg_resolution_hours: number
  reopened: number
  overdue_open: number
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const { data } = await client.get('/dashboard/summary')
  return data
}

export async function getDashboardTrends(days = 14): Promise<DashboardTrends> {
  const { data } = await client.get('/dashboard/trends', { params: { days } })
  return data
}

export async function getDashboardSlaCompliance(days = 30): Promise<DashboardSlaCompliance> {
  const { data } = await client.get('/dashboard/sla_compliance', { params: { days } })
  return data
}

export async function getDashboardTopCategories(days = 30, limit = 5): Promise<DashboardTopCategory[]> {
  const { data } = await client.get('/dashboard/top_categories', { params: { days, limit } })
  return data
}

export async function getDashboardOpsKpis(days = 30): Promise<DashboardOpsKpis> {
  const { data } = await client.get('/dashboard/ops_kpis', { params: { days } })
  return data
}

export interface SLABreachHeatmapCell {
  category: string
  priority: number
  total: number
  breached: number
  breach_pct: number
}

export interface PeakVolumeData {
  cells: { day: number; hour_bucket: number; count: number }[]
  max_count: number
}

export interface ReopenRateItem {
  category: string
  total_resolved: number
  reopened: number
  reopen_pct: number
}

export interface ResolutionTimeItem {
  category: string
  count: number
  avg_hours: number
  p50_hours: number
}

export async function getSLABreachHeatmap(days = 90): Promise<SLABreachHeatmapCell[]> {
  const { data } = await client.get('/dashboard/sla-breach-heatmap', { params: { days } })
  return data
}

export async function getPeakVolume(days = 90): Promise<PeakVolumeData> {
  const { data } = await client.get('/dashboard/peak-volume', { params: { days } })
  return data
}

export async function getReopenRate(days = 90): Promise<ReopenRateItem[]> {
  const { data } = await client.get('/dashboard/reopen-rate', { params: { days } })
  return data
}

export async function getResolutionTime(days = 90): Promise<ResolutionTimeItem[]> {
  const { data } = await client.get('/dashboard/resolution-time', { params: { days } })
  return data
}
