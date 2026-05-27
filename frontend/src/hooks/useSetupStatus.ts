import { useQuery } from '@tanstack/react-query'
import { getSetupStatus } from '@/api/setup'
import { STALE } from './staleTime'

export function useSetupStatus() {
  return useQuery({
    queryKey: ['setup-status'],
    queryFn: getSetupStatus,
    staleTime: STALE.setup,
    retry: false,
  })
}
