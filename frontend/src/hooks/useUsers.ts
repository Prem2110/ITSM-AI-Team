import { useQuery } from '@tanstack/react-query'
import { listUsers } from '@/api/users'

export function useUsers(role?: string, enabled = true) {
  return useQuery({
    queryKey: ['users', role],
    queryFn: () => listUsers(role),
    staleTime: 60 * 1000,
    enabled,
    retry: false,
  })
}
