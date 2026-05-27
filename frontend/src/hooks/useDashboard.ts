import { useQuery } from '@tanstack/react-query'
import {
  getDashboardSummary,
  getDashboardTrends,
  getDashboardSlaCompliance,
  getDashboardTopCategories,
} from '@/api/dashboard'
import { STALE } from './staleTime'

export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: getDashboardSummary,
    staleTime: STALE.dashboard,
  })
}

export function useDashboardTrends(days = 14) {
  return useQuery({
    queryKey: ['dashboard-trends', days],
    queryFn: () => getDashboardTrends(days),
    staleTime: STALE.dashboard,
  })
}

export function useDashboardSlaCompliance(days = 30) {
  return useQuery({
    queryKey: ['dashboard-sla', days],
    queryFn: () => getDashboardSlaCompliance(days),
    staleTime: STALE.dashboard,
  })
}

export function useDashboardTopCategories(days = 30, limit = 5) {
  return useQuery({
    queryKey: ['dashboard-categories', days, limit],
    queryFn: () => getDashboardTopCategories(days, limit),
    staleTime: STALE.dashboard,
  })
}
