import { useRef, useState, useEffect, RefObject } from 'react'
import { Plus } from 'lucide-react'
import { FilterPill } from './FilterPill'
import type { IncidentFilterState } from '@/hooks/useIncidentFilters'
import { useCategories } from '@/hooks/useConfig'
import { useUsers } from '@/hooks/useUsers'

const STATES = ['new','assigned','in_progress','on_hold','resolved','closed']
const STATE_LABELS: Record<string, string> = {
  new:'New', assigned:'Assigned', in_progress:'In Progress',
  on_hold:'On Hold', resolved:'Resolved', closed:'Closed',
}
const PRIORITY_OPTIONS = [
  { value: '1', label: 'Critical' }, { value: '2', label: 'High' },
  { value: '3', label: 'Medium' },  { value: '4', label: 'Low' },
]
const ADD_FILTER_FIELDS = [
  { key: 'state', label: 'State' },
  { key: 'priority', label: 'Priority' },
  { key: 'category', label: 'Category' },
  { key: 'assignee_id', label: 'Assignee' },
]

interface Props {
  filterState: IncidentFilterState
  searchInputRef: RefObject<HTMLInputElement>
}

export function FilterBar({ filterState, searchInputRef }: Props) {
  const { activeFilters, clearFilter, clearAllFilters, setFilter, searchQuery, setSearchQuery } = filterState
  const { data: categories } = useCategories()
  const { data: agents } = useUsers('agent')
  const [addOpen, setAddOpen] = useState(false)
  const [addField, setAddField] = useState<string | null>(null)
  const addRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (addRef.current && !addRef.current.contains(e.target as Node)) {
        setAddOpen(false)
        setAddField(null)
      }
    }
    if (addOpen) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [addOpen])

  // Debounced search
  const [localSearch, setLocalSearch] = useState(searchQuery)
  useEffect(() => { setLocalSearch(searchQuery) }, [searchQuery])
  useEffect(() => {
    const t = setTimeout(() => setSearchQuery(localSearch), 300)
    return () => clearTimeout(t)
  }, [localSearch, setSearchQuery])

  function renderValuePicker(field: string) {
    function pick(val: string) {
      setFilter(field, val)
      setAddOpen(false)
      setAddField(null)
    }
    if (field === 'state') return (
      <div className="py-1">
        {STATES.map(s => (
          <button key={s} onClick={() => pick(s)}
            className="block w-full text-left px-3 py-1 text-xs text-surface-700 hover:bg-surface-100"
          >{STATE_LABELS[s]}</button>
        ))}
      </div>
    )
    if (field === 'priority') return (
      <div className="py-1">
        {PRIORITY_OPTIONS.map(p => (
          <button key={p.value} onClick={() => pick(p.value)}
            className="block w-full text-left px-3 py-1 text-xs text-surface-700 hover:bg-surface-100"
          >{p.label}</button>
        ))}
      </div>
    )
    if (field === 'category') return (
      <div className="py-1">
        {(categories ?? []).map(c => (
          <button key={c} onClick={() => pick(c)}
            className="block w-full text-left px-3 py-1 text-xs text-surface-700 hover:bg-surface-100"
          >{c}</button>
        ))}
      </div>
    )
    if (field === 'assignee_id') return (
      <div className="py-1">
        <button onClick={() => pick('unassigned')}
          className="block w-full text-left px-3 py-1 text-xs text-surface-700 hover:bg-surface-100"
        >Unassigned</button>
        {(agents ?? []).map(u => (
          <button key={u.id} onClick={() => pick(u.id)}
            className="block w-full text-left px-3 py-1 text-xs text-surface-700 hover:bg-surface-100"
          >{u.name}</button>
        ))}
      </div>
    )
    return null
  }

  return (
    <div
      className="flex-none flex items-center gap-2 px-3 border-b border-surface-200 bg-white"
      style={{ height: 36, minHeight: 36 }}
    >
      {/* Active filter pills */}
      <div className="flex items-center gap-1.5 flex-1 overflow-x-auto min-w-0" style={{ flexWrap: 'nowrap' }}>
        {activeFilters.map(f => (
          <FilterPill
            key={f.key}
            label={f.label}
            value={f.displayValue}
            onRemove={() => clearFilter(f.key)}
          />
        ))}
        {activeFilters.length > 1 && (
          <button onClick={clearAllFilters} className="text-2xs text-surface-400 hover:text-surface-600 whitespace-nowrap ml-1">
            Clear all
          </button>
        )}

        {/* Add filter */}
        <div ref={addRef} className="relative flex-none">
          <button
            onClick={() => { setAddOpen(o => !o); setAddField(null) }}
            className="inline-flex items-center gap-1 text-2xs text-surface-500 hover:text-surface-700"
            style={{ height: 22, padding: '0 4px' }}
          >
            <Plus size={11} strokeWidth={2.5} />
            Add filter
          </button>
          {addOpen && (
            <div
              className="absolute left-0 top-6 bg-white border border-surface-200 shadow-md z-50 min-w-[140px]"
              style={{ borderRadius: 3 }}
            >
              {addField === null
                ? ADD_FILTER_FIELDS.map(f => (
                    <button key={f.key} onClick={() => setAddField(f.key)}
                      className="flex items-center justify-between w-full text-left px-3 py-1.5 text-xs text-surface-700 hover:bg-surface-100"
                    >
                      {f.label}
                      <span className="text-surface-400">›</span>
                    </button>
                  ))
                : renderValuePicker(addField)
              }
            </div>
          )}
        </div>
      </div>

      {/* Search */}
      <input
        ref={searchInputRef}
        type="text"
        placeholder="Search title… (/)"
        value={localSearch}
        onChange={e => setLocalSearch(e.target.value)}
        className="border border-surface-200 bg-white text-xs px-2 text-surface-800 placeholder-surface-400 focus:outline-none focus:border-surface-400"
        style={{ height: 24, width: 180, borderRadius: 2 }}
      />
    </div>
  )
}
