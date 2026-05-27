import { useQuery } from '@tanstack/react-query'
import { listUsers } from '@/api/users'
import { STALE } from './staleTime'

export function useUsers(role?: string, enabled = true) {
  return useQuery({
    queryKey: ['users', role],
    queryFn: () => listUsers(role),
    staleTime: STALE.users,
    enabled,
    retry: false,
  })
}
