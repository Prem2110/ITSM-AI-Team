import { useQuery } from '@tanstack/react-query'
import { getAppSettings } from '@/api/setup'

export function useAppSettings() {
  return useQuery({
    queryKey: ['app-settings'],
    queryFn: getAppSettings,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}
