import { useQuery } from '@tanstack/react-query'
import { getSetupStatus } from '@/api/setup'

export function useSetupStatus() {
  return useQuery({
    queryKey: ['setup-status'],
    queryFn: getSetupStatus,
    staleTime: Infinity,
    retry: false,
  })
}
