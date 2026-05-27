import { useQuery } from '@tanstack/react-query'
import { getIncident } from '@/api/incidents'
import { STALE } from './staleTime'

export function useIncident(id: string) {
  return useQuery({
    queryKey: ['incident', id],
    queryFn: () => getIncident(id),
    staleTime: STALE.incidents,
    enabled: !!id,
  })
}
