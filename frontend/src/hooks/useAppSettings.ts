import { useQuery } from '@tanstack/react-query'
import { getAppSettings } from '@/api/setup'
import { STALE } from './staleTime'

export function useAppSettings() {
  return useQuery({
    queryKey: ['app-settings'],
    queryFn: getAppSettings,
    staleTime: STALE.me,  // 10 min — app settings rarely change
    retry: false,
  })
}

export function useResolutionCodes(): string[] {
  const { data } = useAppSettings()
  return data?.resolution_codes ?? []
}
