import { useQuery } from '@tanstack/react-query'
import { getMe } from '@/api/users'
import { STALE } from './staleTime'

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: getMe,
    staleTime: STALE.me,
    retry: false,
  })
}
