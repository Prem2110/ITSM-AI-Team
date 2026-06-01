import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'

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
import { usePriorities } from '@/hooks/useConfig'
import { useIncidentFilters } from '@/hooks/useIncidentFilters'
import { useHandoffReport } from '@/hooks/useAI'
import { useAIStatus } from '@/hooks/useAI'
import { Toolbar } from '@/components/Toolbar'
import { FilterBar } from '@/components/FilterBar'
import { IncidentTable } from '@/components/IncidentTable'
import { Pagination } from '@/components/Pagination'
import { exportIncidentsCsv, runAutoEscalations } from '@/api/incidents'

export default function IncidentsList() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const searchInputRef = useRef<HTMLInputElement>(null)
  const { data: priorities } = usePriorities()
  const filterState = useIncidentFilters()
  const { apiFilters, multiStates, isWaitingForMe, page, setPage } = filterState
  const [handoffOpen, setHandoffOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const handoffMut = useHandoffReport()
  const { data: aiStatus } = useAIStatus()
  const aiEnabled = !!(aiStatus?.ai_enabled && aiStatus?.has_key)

  const { data, isLoading, isError, error, refetch } = useIncidents(apiFilters, !isWaitingForMe)

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

  return (
    <>
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Toolbar
        count={isLoading ? 0 : total}
        isLoading={isLoading}
        onNew={() => navigate('/incidents/new')}
        actions={(
          <>
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

      {isError && (
        <div className="flex-none flex items-center gap-2 px-3 py-1.5 border-b border-red-200 bg-red-50 text-xs text-red-700">
          <span>{parseIncidentError(error)}</span>
          <button onClick={() => refetch()} className="underline hover:no-underline font-medium ml-1">
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
