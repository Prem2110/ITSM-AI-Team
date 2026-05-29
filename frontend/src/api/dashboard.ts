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
