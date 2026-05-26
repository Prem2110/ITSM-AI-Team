import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, AlertTriangle, ChevronDown } from 'lucide-react'
import { useIncident, useMe, useUsers, usePriorities, useCategories, useStates } from '@/hooks'
import { patchIncident, transitionIncident } from '@/api/incidents'
import { createEvent } from '@/api/events'
import { StateBadge } from '@/components/StateBadge'
import { PriorityBadge } from '@/components/PriorityBadge'
import { relativeTime } from '@/utils/relativeTime'
import type { IncidentEvent } from '@/types'

const RESOLUTION_CODES = [
  { value: 'hardware_replaced', label: 'Hardware Replaced' },
  { value: 'software_update', label: 'Software Update' },
  { value: 'configuration_change', label: 'Configuration Change' },
  { value: 'account_reset', label: 'Account / Password Reset' },
  { value: 'access_granted', label: 'Access Granted' },
  { value: 'user_education', label: 'User Education' },
  { value: 'workaround', label: 'Workaround Applied' },
  { value: 'no_fault_found', label: 'No Fault Found' },
  { value: 'duplicate', label: 'Duplicate' },
]

function FieldSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="text-2xs font-semibold text-surface-500 uppercase tracking-wider mb-0.5">{label}</div>
      <div style={{ fontSize: 13 }}>{children}</div>
    </div>
  )
}

function SlaValue({ sla_resolution_due, sla_breached, state, created_at }: {
  sla_resolution_due: string | null
  sla_breached: boolean
  state: string
  created_at: string
}) {
  const isDone = state === 'resolved' || state === 'closed'
  const due = sla_resolution_due ? new Date(sla_resolution_due) : null
  if (!due) return <span className="text-xs text-surface-400">—</span>
  if (isDone) {
    return (
      <span className="text-xs text-surface-500">
        {due.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
      </span>
    )
  }
  const now = Date.now()
  const msRemaining = due.getTime() - now
  const totalMs = due.getTime() - new Date(created_at).getTime()
  const pct = totalMs > 0 ? (msRemaining / totalMs) * 100 : 0

  function fmt(ms: number) {
    const m = Math.floor(Math.abs(ms) / 60000)
    const h = Math.floor(m / 60)
    const d = Math.floor(h / 24)
    if (d > 0) return `${d}d ${h % 24}h`
    if (h > 0) return `${h}h ${m % 60}m`
    return `${m}m`
  }

  if (msRemaining <= 0 || sla_breached) {
    return <span className="text-xs font-medium" style={{ color: '#b91c1c' }}>Breached {fmt(msRemaining)} ago</span>
  }
  const color = pct > 25 ? '#15803d' : '#a16207'
  return <span className="text-xs font-medium" style={{ color }}>Resolve in {fmt(msRemaining)}</span>
}

function EventItem({ event, userMap }: { event: IncidentEvent; userMap: Record<string, string> }) {
  const actor = userMap[event.actor_id] ?? `${event.actor_id.slice(0, 8)}…`
  const when = relativeTime(event.created_at)
  const meta = (event.event_metadata ?? {}) as Record<string, string>

  if (event.event_type === 'comment' || event.event_type === 'work_note') {
    const isWork = event.event_type === 'work_note'
    return (
      <div
        className="p-3"
        style={{
          background: isWork ? 'rgba(245,158,11,0.05)' : 'var(--bg-secondary)',
          border: `1px solid ${isWork ? 'rgba(245,158,11,0.22)' : 'var(--border-color)'}`,
          borderLeft: `3px solid ${isWork ? '#f59e0b' : '#94a3b8'}`,
          borderRadius: 2,
        }}
      >
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-xs font-semibold text-surface-700">{actor}</span>
          {isWork && (
            <span
              style={{
                fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
                padding: '1px 4px', borderRadius: '3px',
                background: 'rgba(245,158,11,0.12)',
                border: '1px solid rgba(245,158,11,0.28)',
                color: '#92400e',
              }}
            >
              WORK NOTE
            </span>
          )}
          <span className="ml-auto text-2xs text-surface-400">{when}</span>
        </div>
        <p className="text-xs text-surface-700 whitespace-pre-wrap leading-relaxed">{event.body}</p>
      </div>
    )
  }

  if (event.event_type === 'state_change') {
    const from = meta.from_state ?? '?'
    const to = meta.to_state ?? '?'
    function toTitle(s: string) { return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) }
    return (
      <div className="flex items-center gap-2 text-2xs text-surface-500" style={{ minHeight: 28 }}>
        <span className="w-1.5 h-1.5 rounded-full bg-surface-300 flex-none" />
        <span>
          <span className="font-semibold text-surface-600">{actor}</span>
          {' '}changed state{' '}
          <span className="font-semibold text-surface-600">{toTitle(from)}</span>
          {' → '}
          <span className="font-semibold text-surface-700">{toTitle(to)}</span>
          {event.body ? <span className="text-surface-400 ml-1">· {event.body}</span> : null}
        </span>
        <span className="ml-auto whitespace-nowrap">{when}</span>
      </div>
    )
  }

  if (event.event_type === 'field_update') {
    if (meta.action === 'created') {
      return (
        <div className="flex items-center gap-2 text-2xs text-surface-500" style={{ minHeight: 28 }}>
          <span className="w-1.5 h-1.5 rounded-full bg-surface-300 flex-none" />
          <span><span className="font-semibold text-surface-600">{actor}</span> created this incident</span>
          <span className="ml-auto whitespace-nowrap">{when}</span>
        </div>
      )
    }
    return (
      <div className="flex items-start gap-2 text-2xs text-surface-500" style={{ minHeight: 28 }}>
        <span className="w-1.5 h-1.5 rounded-full bg-surface-300 flex-none mt-1.5" />
        <span>
          <span className="font-semibold text-surface-600">{actor}</span>
          {' '}updated <span className="font-semibold">{meta.field}</span>
          {meta.old && meta.new ? (
            <span className="text-surface-400"> ({meta.old} → {meta.new})</span>
          ) : null}
        </span>
        <span className="ml-auto whitespace-nowrap">{when}</span>
      </div>
    )
  }

  if (event.event_type === 'attachment_added' || event.event_type === 'attachment_deleted') {
    const verb = event.event_type === 'attachment_added' ? 'added' : 'removed'
    return (
      <div className="flex items-center gap-2 text-2xs text-surface-500" style={{ minHeight: 28 }}>
        <span className="w-1.5 h-1.5 rounded-full bg-surface-300 flex-none" />
        <span><span className="font-semibold text-surface-600">{actor}</span> {verb} an attachment</span>
        <span className="ml-auto whitespace-nowrap">{when}</span>
      </div>
    )
  }

  return null
}

export default function IncidentDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: incident, isLoading, error } = useIncident(id!)
  const { data: me } = useMe()
  const { data: priorities } = usePriorities()
  const { data: categories } = useCategories()
  const { data: statesConfig } = useStates()

  const isAgent = me?.scopes?.includes('Agent') ?? false
  const { data: allUsers } = useUsers(undefined, isAgent)

  const userMap = useMemo(() => {
    const map: Record<string, string> = {}
    if (incident?.requester) map[incident.requester_id] = incident.requester.name
    if (incident?.assignee && incident.assignee_id) map[incident.assignee_id] = incident.assignee.name
    if (me) map[me.user_id] = me.name
    allUsers?.forEach(u => { map[u.id] = u.name })
    return map
  }, [incident, me, allUsers])

  const [showResForm, setShowResForm] = useState(false)
  const [resCode, setResCode] = useState('')
  const [resNotes, setResNotes] = useState('')
  const [transitionOpen, setTransitionOpen] = useState(false)

  const [editTitle, setEditTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [editDesc, setEditDesc] = useState(false)
  const [descDraft, setDescDraft] = useState('')

  const [commentText, setCommentText] = useState('')
  const [commentTab, setCommentTab] = useState<'comment' | 'work_note'>('comment')
  const [commentFocused, setCommentFocused] = useState(false)

  const patchMut = useMutation({
    mutationFn: (fields: Parameters<typeof patchIncident>[1]) => patchIncident(id!, fields),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['incident', id] })
      qc.invalidateQueries({ queryKey: ['incidents'] })
    },
  })

  const transitionMut = useMutation({
    mutationFn: (req: Parameters<typeof transitionIncident>[1]) => transitionIncident(id!, req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['incident', id] })
      qc.invalidateQueries({ queryKey: ['incidents'] })
      setShowResForm(false)
      setResCode('')
      setResNotes('')
      setTransitionOpen(false)
    },
  })

  const commentMut = useMutation({
    mutationFn: (payload: { event_type: 'comment' | 'work_note'; body: string }) =>
      createEvent(id!, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['incident', id] })
      setCommentText('')
    },
  })

  const validTransitions = useMemo(() => {
    if (!incident || !statesConfig) return []
    return statesConfig.transitions[incident.state] ?? []
  }, [incident, statesConfig])

  function handleTransitionClick(toState: string) {
    setTransitionOpen(false)
    if (toState === 'resolved') {
      setShowResForm(true)
    } else {
      transitionMut.mutate({ to_state: toState as import('@/types').IncidentState })
    }
  }

  function handleResolve() {
    transitionMut.mutate({ to_state: 'resolved', resolution_code: resCode, resolution_notes: resNotes })
  }

  function saveTitle() {
    const trimmed = titleDraft.trim()
    if (trimmed && trimmed !== incident?.title) {
      patchMut.mutate({ title: trimmed })
    }
    setEditTitle(false)
  }

  function saveDesc() {
    if (descDraft !== incident?.description) {
      patchMut.mutate({ description: descDraft })
    }
    setEditDesc(false)
  }

  function submitComment() {
    if (!commentText.trim()) return
    commentMut.mutate({ event_type: commentTab, body: commentText.trim() })
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-surface-400">
        Loading…
      </div>
    )
  }

  if (error || !incident) {
    return (
      <div className="flex-1 flex items-center justify-center gap-2 text-xs text-red-600">
        Failed to load incident.
        <button onClick={() => navigate('/incidents')} className="underline text-surface-600">
          Back to list
        </button>
      </div>
    )
  }

  const isClosed = incident.state === 'closed'
  const isResolved = incident.state === 'resolved' || incident.state === 'closed'
  const assigneeOptions = allUsers?.filter(u => u.role !== 'requester') ?? []

  // Requesters can close their own resolved incidents
  const canClose =
    !isAgent &&
    incident.state === 'resolved' &&
    incident.requester_id === me?.user_id

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div
        className="flex-none flex items-center gap-3 px-4 bg-white border-b border-surface-200"
        style={{ height: 44 }}
      >
        <button
          onClick={() => navigate('/incidents')}
          className="flex items-center gap-1 text-xs text-surface-500 hover:text-surface-700 transition-colors flex-none"
        >
          <ChevronLeft size={14} />
          Incidents
        </button>
        <span className="text-surface-300 flex-none">|</span>
        <span className="font-mono text-xs text-surface-500 flex-none">{incident.number}</span>

        {editTitle ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={e => setTitleDraft(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={e => {
              if (e.key === 'Enter') saveTitle()
              if (e.key === 'Escape') setEditTitle(false)
            }}
            className="flex-1 font-semibold bg-transparent border-b border-surface-400 focus:outline-none focus:border-surface-700 min-w-0"
            style={{ fontSize: 15 }}
          />
        ) : (
          <span
            className={`flex-1 font-semibold text-surface-900 truncate ${isAgent && !isClosed ? 'cursor-pointer hover:text-surface-600' : ''}`}
            style={{ fontSize: 15 }}
            onClick={() => {
              if (isAgent && !isClosed) {
                setTitleDraft(incident.title)
                setEditTitle(true)
              }
            }}
            title={incident.title}
          >
            {incident.title}
          </span>
        )}

        <div className="flex items-center gap-2 flex-none">
          <StateBadge state={incident.state} />
          <PriorityBadge priority={incident.priority} priorities={priorities} />

          {incident.sla_breached && (
            <span
              className="flex items-center gap-1 text-2xs font-semibold text-red-600"
              style={{
                padding: '1px 6px', borderRadius: '3px',
                background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)',
              }}
            >
              <AlertTriangle size={10} />
              SLA
            </span>
          )}

          {/* Agent transition dropdown */}
          {isAgent && validTransitions.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setTransitionOpen(v => !v)}
                disabled={transitionMut.isPending}
                className="flex items-center gap-1 text-xs border border-surface-200 px-2 py-0.5 hover:bg-surface-50 text-surface-600 hover:text-surface-800 transition-colors disabled:opacity-50"
                style={{ borderRadius: 2 }}
              >
                {transitionMut.isPending ? 'Saving…' : 'Transition'}
                <ChevronDown size={11} />
              </button>
              {transitionOpen && (
                <>
                  <div className="fixed inset-0 z-[9]" onClick={() => setTransitionOpen(false)} />
                  <div
                    className="absolute right-0 top-full mt-1 bg-white border border-surface-200 shadow-lg z-10 py-1"
                    style={{ borderRadius: 2, minWidth: 130 }}
                  >
                    {validTransitions.map(state => (
                      <button
                        key={state}
                        onClick={() => handleTransitionClick(state)}
                        className="block w-full text-left px-3 py-1.5 text-xs text-surface-700 hover:bg-surface-100 capitalize"
                      >
                        {state.replace(/_/g, ' ')}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Requester "close" button */}
          {canClose && (
            <button
              onClick={() => transitionMut.mutate({ to_state: 'closed' })}
              disabled={transitionMut.isPending}
              className="text-xs border border-surface-200 px-2 py-0.5 hover:bg-surface-50 text-surface-600 hover:text-surface-800 transition-colors disabled:opacity-50"
              style={{ borderRadius: 2 }}
            >
              {transitionMut.isPending ? 'Closing…' : 'Close Incident'}
            </button>
          )}
        </div>
      </div>

      {/* Resolution form strip */}
      {showResForm && (
        <div className="flex-none border-b border-amber-200 px-4 py-3" style={{ background: 'rgba(245,158,11,0.05)' }}>
          <div className="flex items-start gap-4 max-w-3xl">
            <div className="flex-1 min-w-0">
              <div className="text-2xs font-semibold text-surface-400 uppercase tracking-wider mb-1">Resolution Code *</div>
              <select
                value={resCode}
                onChange={e => setResCode(e.target.value)}
                className="w-full text-xs border border-surface-200 bg-white px-2 py-1 focus:outline-none focus:border-surface-400"
                style={{ borderRadius: 2 }}
              >
                <option value="">Select resolution code…</option>
                {RESOLUTION_CODES.map(rc => (
                  <option key={rc.value} value={rc.value}>{rc.label}</option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-2xs font-semibold text-surface-400 uppercase tracking-wider mb-1">Resolution Notes *</div>
              <textarea
                value={resNotes}
                onChange={e => setResNotes(e.target.value)}
                rows={2}
                placeholder="Describe how the issue was resolved…"
                className="w-full text-xs border border-surface-200 bg-white px-2 py-1 focus:outline-none focus:border-surface-400 resize-none"
                style={{ borderRadius: 2 }}
              />
            </div>
            <div className="flex flex-col gap-1.5 pt-5 flex-none">
              <button
                onClick={handleResolve}
                disabled={!resCode || !resNotes.trim() || transitionMut.isPending}
                className="text-xs font-medium px-3 py-1 bg-surface-800 text-white hover:bg-surface-700 disabled:opacity-40 transition-colors"
                style={{ borderRadius: 2 }}
              >
                {transitionMut.isPending ? 'Saving…' : 'Mark Resolved'}
              </button>
              <button
                onClick={() => { setShowResForm(false); setResCode(''); setResNotes('') }}
                className="text-xs text-surface-500 hover:text-surface-700 text-center"
              >
                Cancel
              </button>
            </div>
          </div>
          {transitionMut.isError && (
            <p className="mt-2 text-xs text-red-600">
              {String((transitionMut.error as any)?.response?.data?.detail ?? (transitionMut.error as Error)?.message ?? 'Transition failed')}
            </p>
          )}
        </div>
      )}

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left — description + activity */}
        <div className="flex-1 overflow-y-auto flex flex-col min-w-0">
          {/* Description */}
          <div className="border-b border-surface-100" style={{ paddingLeft: 20, paddingRight: 20, paddingTop: 8, paddingBottom: 8 }}>
            <div className="text-2xs font-semibold text-surface-400 uppercase tracking-wider mb-2">Description</div>
            {editDesc ? (
              <div>
                <textarea
                  autoFocus
                  value={descDraft}
                  onChange={e => setDescDraft(e.target.value)}
                  rows={5}
                  className="w-full text-xs border border-surface-300 bg-white px-3 py-2 focus:outline-none focus:border-surface-500 resize-none"
                  style={{ borderRadius: 2 }}
                />
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={saveDesc}
                    disabled={patchMut.isPending}
                    className="text-xs font-medium px-3 py-1 bg-surface-800 text-white hover:bg-surface-700 disabled:opacity-40"
                    style={{ borderRadius: 2 }}
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditDesc(false)}
                    className="text-xs text-surface-500 hover:text-surface-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div
                className={`text-xs text-surface-700 whitespace-pre-wrap leading-relaxed${isAgent && !isClosed ? ' cursor-pointer hover:bg-surface-50 -mx-1 px-1' : ''}`}
                onClick={() => {
                  if (isAgent && !isClosed) {
                    setDescDraft(incident.description)
                    setEditDesc(true)
                  }
                }}
                title={isAgent && !isClosed ? 'Click to edit' : undefined}
              >
                {incident.description || <span className="text-surface-400 italic">No description provided.</span>}
              </div>
            )}
          </div>

          {/* Activity */}
          <div className="flex-1" style={{ paddingLeft: 20, paddingRight: 20, paddingTop: 12, paddingBottom: 8 }}>
            <div className="text-2xs font-semibold text-surface-400 uppercase tracking-wider mb-3">Activity</div>
            {incident.events.length === 0 ? (
              <div className="text-xs text-surface-400 italic">No activity yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {incident.events.map(event => (
                  <EventItem key={event.id} event={event} userMap={userMap} />
                ))}
              </div>
            )}
          </div>

          {/* Comment box */}
          {!isClosed && (
            <div className="flex-none py-3 border-t border-surface-100 bg-surface-50" style={{ paddingLeft: 20, paddingRight: 20 }}>
              {isAgent && (
                <div
                  className="flex mb-2"
                  style={{ border: '1px solid #e2e8f0', borderRadius: 2, overflow: 'hidden', width: 'fit-content' }}
                >
                  {(['comment', 'work_note'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setCommentTab(tab)}
                      className={`text-2xs font-medium px-3 py-1 transition-colors ${
                        commentTab === tab
                          ? 'bg-surface-800 text-white'
                          : 'bg-white text-surface-600 hover:bg-surface-100'
                      }`}
                    >
                      {tab === 'comment' ? 'Comment' : 'Work Note'}
                    </button>
                  ))}
                </div>
              )}
              <textarea
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                onFocus={() => setCommentFocused(true)}
                onBlur={() => { if (!commentText.trim()) setCommentFocused(false) }}
                onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) submitComment() }}
                placeholder={`Add a ${commentTab === 'work_note' ? 'work note' : 'comment'}… (Ctrl+Enter to submit)`}
                className="w-full text-xs border border-surface-200 bg-white focus:outline-none focus:border-surface-400"
                style={{ height: commentFocused ? 120 : 56, resize: 'none', padding: 8, borderRadius: 2 }}
              />
              <div className="flex justify-end mt-1.5">
                <button
                  onClick={submitComment}
                  disabled={!commentText.trim() || commentMut.isPending}
                  className="text-xs font-medium bg-surface-700 text-white hover:bg-surface-800 disabled:opacity-40 transition-colors"
                  style={{ height: 28, padding: '0 8px', borderRadius: 2 }}
                >
                  {commentMut.isPending ? 'Posting…' : 'Post'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right — fields panel */}
        <div
          className="flex-none overflow-y-auto border-l border-surface-200 bg-surface-50 px-4 py-4"
          style={{ width: 236 }}
        >
          <FieldSection label="Priority">
            {isAgent && !isClosed ? (
              <select
                value={incident.priority}
                onChange={e => patchMut.mutate({ priority: Number(e.target.value) })}
                className="w-full text-xs border border-surface-200 bg-white px-2 py-1 focus:outline-none focus:border-surface-400"
                style={{ borderRadius: 2 }}
              >
                {priorities?.map(p => (
                  <option key={p.level} value={p.level}>{p.name}</option>
                )) ?? [1, 2, 3, 4].map(n => <option key={n} value={n}>P{n}</option>)}
              </select>
            ) : (
              <PriorityBadge priority={incident.priority} priorities={priorities} />
            )}
          </FieldSection>

          <FieldSection label="Category">
            {isAgent && !isClosed ? (
              <select
                value={incident.category}
                onChange={e => patchMut.mutate({ category: e.target.value })}
                className="w-full text-xs border border-surface-200 bg-white px-2 py-1 focus:outline-none focus:border-surface-400"
                style={{ borderRadius: 2 }}
              >
                {categories?.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            ) : (
              <span className="text-surface-800">{incident.category}</span>
            )}
          </FieldSection>

          <FieldSection label="Assignee">
            {isAgent && !isClosed ? (
              <select
                value={incident.assignee_id ?? ''}
                onChange={e => patchMut.mutate({ assignee_id: e.target.value || null })}
                className="w-full text-xs border border-surface-200 bg-white px-2 py-1 focus:outline-none focus:border-surface-400"
                style={{ borderRadius: 2 }}
              >
                <option value="">Unassigned</option>
                {assigneeOptions.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            ) : (
              <span className="text-surface-800">
                {incident.assignee?.name ?? <span className="text-surface-400">Unassigned</span>}
              </span>
            )}
          </FieldSection>

          <FieldSection label="Requester">
            <span className="text-xs text-surface-800 font-medium">{incident.requester.name}</span>
            <div className="text-2xs text-surface-400 mt-0.5">{incident.requester.email}</div>
          </FieldSection>

          <FieldSection label="Source">
            <span className="text-surface-800 capitalize">{incident.source.replace(/_/g, ' ')}</span>
          </FieldSection>

          <div className="border-t border-surface-200 my-2" />

          <FieldSection label="SLA Due">
            <SlaValue
              sla_resolution_due={incident.sla_resolution_due}
              sla_breached={incident.sla_breached}
              state={incident.state}
              created_at={incident.created_at}
            />
          </FieldSection>

          <div className="border-t border-surface-200 my-2" />

          <FieldSection label="Created">
            <span className="text-surface-800" title={incident.created_at}>
              {relativeTime(incident.created_at)}
            </span>
          </FieldSection>

          <FieldSection label="Updated">
            <span className="text-surface-800" title={incident.updated_at}>
              {relativeTime(incident.updated_at)}
            </span>
          </FieldSection>

          {incident.resolved_at && (
            <FieldSection label="Resolved">
              <span className="text-surface-800" title={incident.resolved_at}>
                {relativeTime(incident.resolved_at)}
              </span>
            </FieldSection>
          )}

          {incident.closed_at && (
            <FieldSection label="Closed">
              <span className="text-surface-800" title={incident.closed_at}>
                {relativeTime(incident.closed_at)}
              </span>
            </FieldSection>
          )}

          {isResolved && incident.resolution_code && (
            <>
              <div className="border-t border-surface-200 my-2" />
              <FieldSection label="Resolution Code">
                <span className="text-surface-800">
                  {RESOLUTION_CODES.find(r => r.value === incident.resolution_code)?.label ?? incident.resolution_code}
                </span>
              </FieldSection>
              {incident.resolution_notes && (
                <FieldSection label="Resolution Notes">
                  <p className="text-surface-800 whitespace-pre-wrap leading-relaxed">{incident.resolution_notes}</p>
                </FieldSection>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
