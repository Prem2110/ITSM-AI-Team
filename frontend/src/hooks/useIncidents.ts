import { useQuery } from '@tanstack/react-query'
import { listIncidents } from '@/api/incidents'
import type { IncidentFilters } from '@/types'
import { STALE } from './staleTime'

export function useIncidents(filters: IncidentFilters = {}, enabled = true) {
  return useQuery({
    queryKey: ['incidents', filters],
    queryFn: () => listIncidents(filters),
    staleTime: STALE.incidents,
    enabled,
  })
}
