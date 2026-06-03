import { useQuery } from '@tanstack/react-query'
import {
  getDashboardSummary,
  getDashboardTrends,
  getDashboardSlaCompliance,
  getDashboardTopCategories,
  getDashboardOpsKpis,
  getSLABreachHeatmap,
  getPeakVolume,
  getReopenRate,
  getResolutionTime,
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

export function useDashboardOpsKpis(days = 30) {
  return useQuery({
    queryKey: ['dashboard-ops-kpis', days],
    queryFn: () => getDashboardOpsKpis(days),
    staleTime: STALE.dashboard,
  })
}

export function useSLABreachHeatmap(days = 90) {
  return useQuery({
    queryKey: ['dashboard-sla-heatmap', days],
    queryFn: () => getSLABreachHeatmap(days),
    staleTime: STALE.dashboard,
  })
}

export function usePeakVolume(days = 90) {
  return useQuery({
    queryKey: ['dashboard-peak-volume', days],
    queryFn: () => getPeakVolume(days),
    staleTime: STALE.dashboard,
  })
}

export function useReopenRate(days = 90) {
  return useQuery({
    queryKey: ['dashboard-reopen-rate', days],
    queryFn: () => getReopenRate(days),
    staleTime: STALE.dashboard,
  })
}

export function useResolutionTime(days = 90) {
  return useQuery({
    queryKey: ['dashboard-resolution-time', days],
    queryFn: () => getResolutionTime(days),
    staleTime: STALE.dashboard,
  })
}
