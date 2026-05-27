import { useQuery } from '@tanstack/react-query'
import { getPriorities, getCategories, getStates } from '@/api/config'
import { STALE } from './staleTime'

export function usePriorities() {
  return useQuery({
    queryKey: ['config', 'priorities'],
    queryFn: getPriorities,
    staleTime: STALE.config,
  })
}

export function useCategories() {
  return useQuery({
    queryKey: ['config', 'categories'],
    queryFn: getCategories,
    staleTime: STALE.config,
  })
}

export function useStates() {
  return useQuery({
    queryKey: ['config', 'states'],
    queryFn: getStates,
    staleTime: STALE.config,
  })
}
