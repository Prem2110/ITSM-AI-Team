import { useQuery } from '@tanstack/react-query'
import { getPriorities, getCategories, getStates } from '@/api/config'

export function usePriorities() {
  return useQuery({
    queryKey: ['config', 'priorities'],
    queryFn: getPriorities,
    staleTime: 60 * 60 * 1000,
  })
}

export function useCategories() {
  return useQuery({
    queryKey: ['config', 'categories'],
    queryFn: getCategories,
    staleTime: 60 * 60 * 1000,
  })
}

export function useStates() {
  return useQuery({
    queryKey: ['config', 'states'],
    queryFn: getStates,
    staleTime: 60 * 60 * 1000,
  })
}
