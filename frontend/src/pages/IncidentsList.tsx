import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { List, Columns } from 'lucide-react'

function parseIncidentError(error: unknown): string {
  const err = error as any
  if (!err) return 'Failed to load incidents.'
  // Network / no response
  if (err.code === 'ERR_NETWORK' || err.code === 'ECONNREFUSED' || !err.response) {
    return 'Cannot reach the server — check your network or backend status.'
  }
  const status: number = err.response?.status
  const detail: string = err.response?.data?.detail ?? err.response?.data?.message ?? ''
  if (status === 401) return '401 · Not authenticated — please log in again.'
  if (status === 403) return '403 · You don\'t have permission to view incidents.'
  if (status === 404) return '404 · Incidents endpoint not found — the API may be misconfigured.'
  if (status === 422) return `422 · Invalid request — ${detail || 'check your active filters.'}`
  if (status === 429) return '429 · Too many requests — slow down and retry.'
  if (status >= 500) return `${status} · Server error${detail ? ` — ${detail}` : ' — the backend may be down or restarting.'}`
  if (status) return `${status} · ${detail || 'Unexpected error loading incidents.'}`
  return detail || 'Failed to load incidents.'
}
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useIncidents } from '@/hooks/useIncidents'
import { usePriorities, useStates } from '@/hooks/useConfig'
import { useIncidentFilters } from '@/hooks/useIncidentFilters'
import { useHandoffReport } from '@/hooks/useAI'
import { useAIStatus } from '@/hooks/useAI'
import { useUsers } from '@/hooks/useUsers'
import { useMe } from '@/hooks/useMe'
import { Toolbar } from '@/components/Toolbar'
import { FilterBar } from '@/components/FilterBar'
import { IncidentTable } from '@/components/IncidentTable'
import { Pagination } from '@/components/Pagination'
import { KanbanBoard } from '@/components/KanbanBoard'
import { exportIncidentsCsv, runAutoEscalations, patchIncident, transitionIncident } from '@/api/incidents'
import type { IncidentState } from '@/types'

export default function IncidentsList() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const searchInputRef = useRef<HTMLInputElement>(null)
  const assignDropdownRef = useRef<HTMLDivElement>(null)
  const { data: priorities } = usePriorities()
  const { data: statesConfig } = useStates()
  const { data: me } = useMe()
  const isAgent = me?.scopes?.includes('Agent') ?? false
  const filterState = useIncidentFilters()
  const { apiFilters, multiStates, isWaitingForMe, page, setPage } = filterState

  // ── View mode (list / kanban) ─────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>(() =>
    (localStorage.getItem('incidents_view') as 'list' | 'kanban') ?? 'list'
  )
  function switchView(mode: 'list' | 'kanban') {
    setViewMode(mode)
    localStorage.setItem('incidents_view', mode)
  }

  // Kanban fetches all active states, ignores state filter, uses large page
  const kanbanFilters = useMemo(() => ({
    ...apiFilters,
    state: undefined,
    page_size: 200,
    page: 1,
  }), [apiFilters])
  const [handoffOpen, setHandoffOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const handoffMut = useHandoffReport()
  const { data: aiStatus } = useAIStatus()
  const aiEnabled = !!(aiStatus?.ai_enabled && aiStatus?.has_key)

  // ── Bulk selection ────────────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [assignOpen, setAssignOpen] = useState(false)
  const [bulkPending, setBulkPending] = useState(false)

  const { data: agents } = useUsers('agent')

  // Reset selection when filters or page change
  useEffect(() => { setSelectedIds(new Set()) }, [page, apiFilters])

  // Close assign dropdown on outside click
  useEffect(() => {
    if (!assignOpen) return
    function handler(e: MouseEvent) {
      if (assignDropdownRef.current && !assignDropdownRef.current.contains(e.target as Node)) {
        setAssignOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [assignOpen])

  function handleToggle(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleToggleAll() {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(items.map(i => i.id)))
    }
  }

  async function handleBulkAssign(assigneeId: string | null) {
    setBulkPending(true)
    setAssignOpen(false)
    const ids = Array.from(selectedIds)
    await Promise.allSettled(ids.map(id => patchIncident(id, { assignee_id: assigneeId })))
    await queryClient.invalidateQueries({ queryKey: ['incidents'] })
    setSelectedIds(new Set())
    setBulkPending(false)
  }

  async function handleBulkClose() {
    setBulkPending(true)
    const closeable = items.filter(i => selectedIds.has(i.id) && i.state === 'resolved')
    await Promise.allSettled(closeable.map(i => transitionIncident(i.id, { to_state: 'closed' })))
    await queryClient.invalidateQueries({ queryKey: ['incidents'] })
    setSelectedIds(new Set())
    setBulkPending(false)
  }

  // ── Data ──────────────────────────────────────────────────────────────────────
  const effectiveFilters = viewMode === 'kanban' ? kanbanFilters : apiFilters
  const { data, isLoading, isError, error, refetch } = useIncidents(effectiveFilters, !isWaitingForMe)

  async function handleKanbanTransition(id: string, toState: string, resCode?: string, resNotes?: string) {
    await transitionIncident(id, {
      to_state: toState as IncidentState,
      resolution_code: resCode,
      resolution_notes: resNotes,
    })
    queryClient.invalidateQueries({ queryKey: ['incidents'] })
  }

  const escalationMutation = useMutation({
    mutationFn: () => runAutoEscalations(200),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['incidents'] })
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })

  const exportMutation = useMutation({
    mutationFn: () => exportIncidentsCsv(apiFilters),
    onSuccess: (csvText) => {
      const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'incidents-export.csv'
      a.click()
      URL.revokeObjectURL(url)
    },
  })

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

  const closeableCount = items.filter(i => selectedIds.has(i.id) && i.state === 'resolved').length

  return (
    <>
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Toolbar
        count={isLoading ? 0 : total}
        isLoading={isLoading}
        onNew={() => navigate('/incidents/new')}
        actions={(
          <>
            {/* View toggle — available to all users */}
            <div
              style={{
                display: 'inline-flex', borderRadius: 4, overflow: 'hidden',
                border: '1px solid #e2e8f0',
              }}
            >
              <button
                onClick={() => switchView('list')}
                title="List view"
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  height: 28, padding: '0 9px', fontSize: 12, fontWeight: 500,
                  border: 'none', cursor: 'pointer', transition: 'all 0.12s',
                  background: viewMode === 'list' ? '#1e293b' : '#fff',
                  color: viewMode === 'list' ? '#fff' : '#64748b',
                }}
              >
                <List size={13} />
                List
              </button>
              <button
                onClick={() => switchView('kanban')}
                title="Board view"
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  height: 28, padding: '0 9px', fontSize: 12, fontWeight: 500,
                  border: 'none', borderLeft: '1px solid #e2e8f0', cursor: 'pointer', transition: 'all 0.12s',
                  background: viewMode === 'kanban' ? '#1e293b' : '#fff',
                  color: viewMode === 'kanban' ? '#fff' : '#64748b',
                }}
              >
                <Columns size={13} />
                Board
              </button>
            </div>

            {aiEnabled && (
              <button
                onClick={async () => {
                  await handoffMut.mutateAsync()
                  setHandoffOpen(true)
                  setCopied(false)
                }}
                disabled={handoffMut.isPending}
                className="inline-flex items-center gap-1 border border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-60 font-medium transition-colors"
                style={{ height: 28, padding: '0 10px', borderRadius: 4, fontSize: 12 }}
                title="Generate an AI shift handoff report for all open incidents"
              >
                {handoffMut.isPending ? 'Generating…' : 'Handoff Report'}
              </button>
            )}
            <button
              onClick={() => exportMutation.mutate()}
              disabled={exportMutation.isPending}
              className="inline-flex items-center gap-1 border border-surface-300 bg-white text-surface-700 hover:bg-surface-50 disabled:opacity-60 font-medium transition-colors"
              style={{ height: 28, padding: '0 10px', borderRadius: 4, fontSize: 12 }}
            >
              {exportMutation.isPending ? 'Exporting...' : 'Export CSV'}
            </button>
            <button
              onClick={() => escalationMutation.mutate()}
              disabled={escalationMutation.isPending}
              className="inline-flex items-center gap-1 border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-60 font-medium transition-colors"
              style={{ height: 28, padding: '0 10px', borderRadius: 4, fontSize: 12 }}
              title="Escalate open SLA-breached incidents by one priority level"
            >
              {escalationMutation.isPending ? 'Running...' : 'Run Escalation'}
            </button>
          </>
        )}
      />

      <FilterBar
        filterState={filterState}
        searchInputRef={searchInputRef as React.RefObject<HTMLInputElement>}
      />

      {/* ── Bulk action bar ──────────────────────────────────────────────────── */}
      {selectedIds.size > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, height: 36, flexShrink: 0,
          padding: '0 12px', borderBottom: '1px solid #c7d2fe', background: '#eef2ff',
        }}>
          {/* Count */}
          <span style={{ fontSize: 12, fontWeight: 600, color: '#4338ca', whiteSpace: 'nowrap' }}>
            {selectedIds.size} selected
          </span>

          <span style={{ color: '#c7d2fe', fontSize: 14 }}>|</span>

          {/* Assign to dropdown */}
          <div ref={assignDropdownRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setAssignOpen(v => !v)}
              disabled={bulkPending}
              style={{
                height: 24, padding: '0 8px', borderRadius: 3, fontSize: 11, fontWeight: 500,
                border: '1px solid #a5b4fc', background: assignOpen ? '#e0e7ff' : '#fff',
                color: '#4338ca', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
                opacity: bulkPending ? 0.5 : 1,
              }}
            >
              Assign to
              <svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor">
                <path d="M5 7L1 3h8z"/>
              </svg>
            </button>
            {assignOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 200,
                background: '#fff', border: '1px solid #e2e8f0', borderRadius: 4,
                boxShadow: '0 4px 16px rgba(0,0,0,0.12)', minWidth: 180, overflow: 'hidden',
              }}>
                {(agents ?? []).map(agent => (
                  <button
                    key={agent.id}
                    onClick={() => handleBulkAssign(agent.id)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '6px 10px', fontSize: 12, color: '#1e293b',
                      background: 'none', border: 'none', cursor: 'pointer',
                      borderBottom: '1px solid #f1f5f9',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                  >
                    <div style={{ fontWeight: 500 }}>{agent.name}</div>
                    <div style={{ fontSize: 10, color: '#94a3b8' }}>{agent.email}</div>
                  </button>
                ))}
                {(agents ?? []).length === 0 && (
                  <div style={{ padding: '8px 10px', fontSize: 12, color: '#94a3b8' }}>No agents found</div>
                )}
              </div>
            )}
          </div>

          {/* Unassign */}
          <button
            onClick={() => handleBulkAssign(null)}
            disabled={bulkPending}
            style={{
              height: 24, padding: '0 8px', borderRadius: 3, fontSize: 11, fontWeight: 500,
              border: '1px solid #cbd5e1', background: '#fff', color: '#475569',
              cursor: 'pointer', opacity: bulkPending ? 0.5 : 1,
            }}
          >
            Unassign
          </button>

          <span style={{ color: '#c7d2fe', fontSize: 14 }}>|</span>

          {/* Close resolved */}
          <button
            onClick={handleBulkClose}
            disabled={bulkPending || closeableCount === 0}
            title={closeableCount === 0
              ? 'None of the selected incidents are in resolved state'
              : `Close ${closeableCount} resolved incident${closeableCount !== 1 ? 's' : ''}`}
            style={{
              height: 24, padding: '0 8px', borderRadius: 3, fontSize: 11, fontWeight: 500,
              border: '1px solid #fcd34d', background: '#fffbeb', color: '#92400e',
              cursor: closeableCount === 0 ? 'not-allowed' : 'pointer',
              opacity: bulkPending || closeableCount === 0 ? 0.45 : 1,
            }}
          >
            Close resolved{closeableCount > 0 ? ` (${closeableCount})` : ''}
          </button>

          {bulkPending && (
            <span style={{ fontSize: 11, color: '#6366f1' }}>Applying…</span>
          )}

          {/* Clear */}
          <button
            onClick={() => setSelectedIds(new Set())}
            disabled={bulkPending}
            style={{
              marginLeft: 'auto', fontSize: 11, color: '#818cf8', background: 'none',
              border: 'none', cursor: 'pointer', padding: '0 4px', fontWeight: 500,
              opacity: bulkPending ? 0.5 : 1,
            }}
          >
            Clear selection
          </button>
        </div>
      )}

      {isError && (
        <div className="flex-none flex items-center gap-2 px-3 py-1.5 border-b border-red-200 bg-red-50 text-xs text-red-700">
          <span>{parseIncidentError(error)}</span>
          <button onClick={() => refetch()} className="underline hover:no-underline font-medium ml-1">
            Retry
          </button>
        </div>
      )}

      {viewMode === 'kanban' ? (
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <KanbanBoard
            items={items}
            priorities={priorities ?? []}
            validTransitionsMap={statesConfig?.transitions ?? {}}
            onTransition={handleKanbanTransition}
            isAgent={isAgent}
          />
        </div>
      ) : (
        <>
          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
            <IncidentTable
              items={items}
              priorities={priorities ?? []}
              sort={filterState.sort}
              order={filterState.order}
              onSort={filterState.setSort}
              isLoading={isLoading}
              selectedIds={selectedIds}
              onToggle={handleToggle}
              onToggleAll={handleToggleAll}
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
        </>
      )}
    </div>

    {handoffOpen && handoffMut.data && createPortal(
      <div
        onClick={() => setHandoffOpen(false)}
        style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24,
        }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{
            background: '#fff', borderRadius: 6, width: '100%', maxWidth: 680,
            maxHeight: '80vh', display: 'flex', flexDirection: 'column',
            boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 16px', borderBottom: '1px solid #e2e8f0',
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>Shift Handoff Report</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>AI-generated · review before sharing</div>
            </div>
            <button
              onClick={() => setHandoffOpen(false)}
              style={{ color: '#94a3b8', fontSize: 18, lineHeight: 1, background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
            >
              ×
            </button>
          </div>
          {/* Body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
            <pre style={{ fontSize: 12, color: '#334155', whiteSpace: 'pre-wrap', lineHeight: 1.65, margin: 0, fontFamily: 'inherit' }}>
              {handoffMut.data.report}
            </pre>
          </div>
          {/* Footer */}
          <div
            style={{
              display: 'flex', justifyContent: 'flex-end', gap: 8,
              padding: '10px 16px', borderTop: '1px solid #e2e8f0',
            }}
          >
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(handoffMut.data!.report)
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
              }}
              style={{
                fontSize: 12, padding: '4px 12px', borderRadius: 3, border: '1px solid #cbd5e1',
                background: copied ? '#f0fdf4' : '#fff', color: copied ? '#15803d' : '#475569',
                cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <button
              onClick={() => setHandoffOpen(false)}
              style={{
                fontSize: 12, padding: '4px 12px', borderRadius: 3, border: 'none',
                background: '#1e293b', color: '#fff', cursor: 'pointer',
              }}
            >
              Close
            </button>
          </div>
        </div>
      </div>,
      document.body
    )}
    </>
  )
}
