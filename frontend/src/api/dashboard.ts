import client from './client'

export interface DashboardSummary {
  my_open: number
  all_open: number
  unassigned: number
  breached: number
  by_state: Record<string, number>
  by_priority: Record<string, number>
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const { data } = await client.get('/dashboard/summary')
  return data
}
