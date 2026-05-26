import { useQuery } from '@tanstack/react-query'
import { getIncident } from '@/api/incidents'

export function useIncident(id: string) {
  return useQuery({
    queryKey: ['incident', id],
    queryFn: () => getIncident(id),
    staleTime: 30 * 1000,
    enabled: !!id,
  })
}
