import { useSearchParams } from 'react-router-dom'
import { useCallback, useMemo } from 'react'
import { useMe } from './useMe'
import type { IncidentFilters } from '@/types'

export interface ActiveFilterPill {
  key: string
  label: string
  displayValue: string
}

export interface IncidentFilterState {
  apiFilters: IncidentFilters
  multiStates: string[] | null   // non-null when comma-separated states; API call omits state
  activeFilters: ActiveFilterPill[]
  setFilter: (key: string, value: string) => void
  clearFilter: (key: string) => void
  clearAllFilters: () => void
  searchQuery: string
  setSearchQuery: (q: string) => void
  page: number
  setPage: (page: number) => void
  sort: string
  order: 'asc' | 'desc'
  setSort: (sort: string, order: 'asc' | 'desc') => void
  isWaitingForMe: boolean
}

const STATE_LABELS: Record<string, string> = {
  new: 'New', assigned: 'Assigned', in_progress: 'In Progress',
  on_hold: 'On Hold', resolved: 'Resolved', closed: 'Closed',
  'new,assigned,in_progress,on_hold': 'All Open',
}
const PRIORITY_LABELS: Record<string, string> = { '0': 'Highly Critical', '1': 'Critical', '2': 'High', '3': 'Medium', '4': 'Low' }

export function useIncidentFilters(): IncidentFilterState {
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: me } = useMe()

  const state     = searchParams.get('state') ?? undefined
  const priority  = searchParams.get('priority') ?? undefined
  const assigneeId = searchParams.get('assignee_id') ?? undefined
  const category  = searchParams.get('category') ?? undefined
  const q         = searchParams.get('q') ?? undefined
  const page      = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const sort      = searchParams.get('sort') ?? 'created_at'
  const order     = (searchParams.get('order') ?? 'desc') as 'asc' | 'desc'

  // Multi-state: comma-separated → filter client-side, don't pass to API
  const stateValues = state?.split(',') ?? null
  const multiStates = (stateValues && stateValues.length > 1) ? stateValues : null
  const apiState    = multiStates ? undefined : state

  // 'me' → actual user id
  const isWaitingForMe = assigneeId === 'me' && !me
  const resolvedAssigneeId = assigneeId === 'me' ? me?.user_id : assigneeId

  const apiFilters: IncidentFilters = useMemo(() => ({
    state: apiState,
    priority: priority ? parseInt(priority, 10) : undefined,
    assignee_id: resolvedAssigneeId,
    category,
    q,
    sort,
    order,
    page,
    page_size: 25,
  }), [apiState, priority, resolvedAssigneeId, category, q, sort, order, page])

  const activeFilters = useMemo<ActiveFilterPill[]>(() => {
    const pills: ActiveFilterPill[] = []
    if (state) pills.push({ key: 'state', label: 'State', displayValue: STATE_LABELS[state] ?? state })
    if (priority) pills.push({ key: 'priority', label: 'Priority', displayValue: PRIORITY_LABELS[priority] ?? priority })
    if (assigneeId) {
      const dv = assigneeId === 'me' ? 'Me' : assigneeId === 'unassigned' ? 'Unassigned' : assigneeId
      pills.push({ key: 'assignee_id', label: 'Assignee', displayValue: dv })
    }
    if (category) pills.push({ key: 'category', label: 'Category', displayValue: category })
    return pills
  }, [state, priority, assigneeId, category])

  const mutate = useCallback((updates: Record<string, string | undefined>) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      for (const [k, v] of Object.entries(updates)) {
        if (v === undefined || v === '') next.delete(k)
        else next.set(k, v)
      }
      next.delete('page')
      return next
    })
  }, [setSearchParams])

  const setFilter      = useCallback((key: string, value: string) => mutate({ [key]: value }), [mutate])
  const clearFilter    = useCallback((key: string) => mutate({ [key]: undefined }), [mutate])
  const clearAllFilters = useCallback(() => setSearchParams({}), [setSearchParams])
  const setSearchQuery  = useCallback((qv: string) => mutate({ q: qv || undefined }), [mutate])

  const setPage = useCallback((p: number) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (p <= 1) next.delete('page')
      else next.set('page', String(p))
      return next
    })
  }, [setSearchParams])

  const setSort = useCallback((s: string, o: 'asc' | 'desc') => mutate({ sort: s, order: o }), [mutate])

  return { apiFilters, multiStates, activeFilters, setFilter, clearFilter, clearAllFilters,
           searchQuery: q ?? '', setSearchQuery, page, setPage, sort, order, setSort, isWaitingForMe }
}
