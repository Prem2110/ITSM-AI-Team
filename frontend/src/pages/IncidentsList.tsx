import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useIncidents } from '@/hooks/useIncidents'
import { usePriorities } from '@/hooks/useConfig'
import { useIncidentFilters } from '@/hooks/useIncidentFilters'
import { Toolbar } from '@/components/Toolbar'
import { FilterBar } from '@/components/FilterBar'
import { IncidentTable } from '@/components/IncidentTable'
import { Pagination } from '@/components/Pagination'

export default function IncidentsList() {
  const navigate = useNavigate()
  const searchInputRef = useRef<HTMLInputElement>(null)
  const { data: priorities } = usePriorities()
  const filterState = useIncidentFilters()
  const { apiFilters, multiStates, isWaitingForMe, page, setPage } = filterState

  const { data, isLoading, isError, refetch } = useIncidents(apiFilters, !isWaitingForMe)

  // "/" shortcut → focus search
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const tag = (document.activeElement as HTMLElement)?.tagName
      if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  // Client-side multi-state filter
  const allItems = data?.items ?? []
  const items = multiStates
    ? allItems.filter(i => multiStates.includes(i.state))
    : allItems
  const total = multiStates ? items.length : (data?.total ?? 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Toolbar
        count={isLoading ? 0 : total}
        isLoading={isLoading}
        onNew={() => navigate('/incidents/new')}
      />

      <FilterBar
        filterState={filterState}
        searchInputRef={searchInputRef as React.RefObject<HTMLInputElement>}
      />

      {isError && (
        <div className="flex-none flex items-center gap-2 px-3 py-1.5 border-b border-red-200 bg-red-50 text-xs text-red-700">
          Failed to load incidents.
          <button onClick={() => refetch()} className="underline hover:no-underline font-medium">
            Retry
          </button>
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        <IncidentTable
          items={items}
          priorities={priorities ?? []}
          sort={filterState.sort}
          order={filterState.order}
          onSort={filterState.setSort}
          isLoading={isLoading}
        />
      </div>

      {!multiStates && (
        <Pagination
          page={page}
          total={data?.total ?? 0}
          pageSize={25}
          onPage={setPage}
        />
      )}
    </div>
  )
}
