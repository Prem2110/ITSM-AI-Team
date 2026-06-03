import React, { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  ChevronLeft, AlertTriangle, ChevronDown, Loader2, Brain,
  MessageSquare, Lock, ArrowRight, UserPlus, FileUp, FileText, Lightbulb, Pencil
} from 'lucide-react'
import { useCollaboration } from '@/hooks/useCollaboration'
import type { PresenceUser } from '@/hooks/useCollaboration'
import { motion, AnimatePresence } from 'framer-motion'
import { Skeleton } from '@/components/Skeleton'
import { useIncident, useMe, useUsers, usePriorities, useCategories, useStates, useResolutionCodes } from '@/hooks'
import { useAIStatus, useSimilarIncidents, useSummarizeIncident, useDraftReply, useDraftResolution } from '@/hooks/useAI'
import { patchIncident, transitionIncident } from '@/api/incidents'
import { createEvent } from '@/api/events'
import { StateBadge } from '@/components/StateBadge'
import { PriorityBadge } from '@/components/PriorityBadge'
import { SpinButton } from '@/components/SpinButton'
import { relativeTime } from '@/utils/relativeTime'
import type { IncidentEvent } from '@/types'

const STATE_ORDER = ['new', 'assigned', 'in_progress', 'on_hold', 'resolved', 'closed']

const TRANSITION_LABELS: Record<string, string> = {
  new: 'Reopen',
  assigned: 'Assign',
  in_progress: 'Start Work',
  on_hold: 'Put on Hold',
  resolved: 'Resolve',
  closed: 'Close',
}

// Primary "forward" transitions shown as inline buttons; others visible only in the badge popover
const PRIMARY_TRANSITIONS: Record<string, string[]> = {
  new: ['assigned'],
  assigned: ['in_progress', 'on_hold'],
  in_progress: ['resolved', 'on_hold'],
  on_hold: ['in_progress'],
  resolved: ['closed'],
  closed: [],
}

const STEPPER_META: Record<string, { label: string; color: string }> = {
  new:         { label: 'New',         color: '#1d4ed8' },
  assigned:    { label: 'Assigned',    color: '#7c3aed' },
  in_progress: { label: 'In Progress', color: '#a16207' },
  on_hold:     { label: 'On Hold',     color: '#475569' },
  resolved:    { label: 'Resolved',    color: '#15803d' },
  closed:      { label: 'Closed',      color: '#334155' },
}

function StatusStepper({ currentState }: { currentState: string }) {
  const currentIdx = STATE_ORDER.indexOf(currentState)
  return (
    <div className="flex-none border-b border-surface-100 bg-white" style={{ paddingLeft: 20, paddingRight: 20, height: 34 }}>
      <div className="flex items-center h-full">
        {STATE_ORDER.flatMap((state, i) => {
          const isPast = i < currentIdx
          const isCurrent = i === currentIdx
          const meta = STEPPER_META[state] ?? { label: state, color: '#475569' }
          const items: React.ReactNode[] = [
            <div key={`node-${state}`} className="flex items-center gap-1.5 flex-none">
              <motion.div
                animate={isCurrent ? {
                  backgroundColor: meta.color,
                  borderColor: meta.color,
                  scale: 1.3,
                  boxShadow: [
                    `0 0 0px 0px ${meta.color}55`,
                    `0 0 6px 3px ${meta.color}66`,
                    `0 0 0px 0px ${meta.color}55`,
                  ],
                } : {
                  backgroundColor: isPast ? '#94a3b8' : 'transparent',
                  borderColor: isPast ? '#94a3b8' : '#d1d5db',
                  scale: 1,
                  boxShadow: '0 0 0px 0px transparent',
                }}
                transition={isCurrent ? {
                  backgroundColor: { duration: 0.22 },
                  borderColor: { duration: 0.22 },
                  scale: { duration: 0.22 },
                  boxShadow: { duration: 1.8, repeat: Infinity, ease: 'easeInOut' },
                } : { duration: 0.22 }}
                style={{ width: 7, height: 7, borderRadius: '50%', border: '1.5px solid', flexShrink: 0 }}
              />
              <span style={{
                fontSize: 10,
                fontWeight: isCurrent ? 700 : 400,
                color: isCurrent ? meta.color : isPast ? '#64748b' : '#d1d5db',
                whiteSpace: 'nowrap',
                transition: 'color 0.2s',
              }}>
                {meta.label}
              </span>
            </div>,
          ]
          if (i < STATE_ORDER.length - 1) {
            items.push(
              <div
                key={`line-${i}`}
                style={{
                  flex: 1, height: 1, minWidth: 10,
                  background: i < currentIdx ? '#94a3b8' : '#e2e8f0',
                  margin: '0 6px',
                  transition: 'background 0.3s',
                }}
              />
            )
          }
          return items
        })}
      </div>
    </div>
  )
}

function LockedByBadge({ user }: { user: PresenceUser }) {
  const { t } = useTranslation()
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 7px', borderRadius: 3, fontSize: 10,
      background: '#f1f5f9', border: '1px solid #e2e8f0', color: '#64748b',
    }}>
      <div style={{ width: 5, height: 5, borderRadius: '50%', background: user.color, flexShrink: 0 }} />
      <Lock size={9} style={{ color: '#94a3b8' }} />
      {user.name.split(' ')[0]} {t('incidentDetail.isEditing')}
    </div>
  )
}

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
  const { t } = useTranslation()
  const isDone = state === 'resolved' || state === 'closed'
  const due = sla_resolution_due ? new Date(sla_resolution_due) : null
  if (!due) return <span className="text-xs text-surface-400">—</span>
  if (isDone) {
    return (
      <span className="text-xs text-surface-500 font-medium">
        {due.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
      </span>
    )
  }
  const now = Date.now()
  const msRemaining = due.getTime() - now
  const totalMs = due.getTime() - new Date(created_at).getTime()
  const elapsedMs = totalMs - msRemaining
  const elapsedPct = totalMs > 0 ? (elapsedMs / totalMs) * 100 : 0
  const pctRemaining = 100 - elapsedPct

  function fmt(ms: number) {
    const m = Math.floor(Math.abs(ms) / 60000)
    const h = Math.floor(m / 60)
    const d = Math.floor(h / 24)
    if (d > 0) return `${d}d ${h % 24}h`
    if (h > 0) return `${h}h ${m % 60}m`
    return `${m}m`
  }

  const isBreached = msRemaining <= 0 || sla_breached
  
  const radius = 12
  const stroke = 2.5
  const normalizedRadius = radius - stroke * 2
  const circumference = normalizedRadius * 2 * Math.PI
  const strokeDashoffset = circumference - (Math.max(0, Math.min(100, isBreached ? 100 : pctRemaining)) / 100) * circumference

  let color = '#10b981' // Green
  let textClass = 'text-emerald-600 dark:text-emerald-400 font-semibold'
  let ringClass = ''

  if (isBreached) {
    color = '#ef4444' // Red
    textClass = 'text-rose-600 dark:text-rose-400 font-bold'
    ringClass = 'pulse-breached'
  } else if (pctRemaining < 25) {
    color = '#f59e0b' // Amber
    textClass = 'text-amber-600 dark:text-amber-400 font-semibold'
  }

  return (
    <div className="flex items-center gap-2.5 mt-1 no-theme-transition">
      <div className={`relative flex-none w-8 h-8 flex items-center justify-center ${ringClass}`}>
        <svg height={32} width={32} className="transform -rotate-90">
          <circle
            stroke="#cbd5e1"
            className="dark:stroke-slate-700"
            fill="transparent"
            strokeWidth={stroke}
            r={normalizedRadius}
            cx={16}
            cy={16}
          />
          <motion.circle
            stroke={color}
            fill="transparent"
            strokeWidth={stroke}
            strokeDasharray={circumference + ' ' + circumference}
            style={{ strokeDashoffset }}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
            strokeLinecap="round"
            r={normalizedRadius}
            cx={16}
            cy={16}
          />
        </svg>
        <span className="absolute text-[8px] font-extrabold" style={{ color }}>
          {isBreached ? '!' : `${Math.round(pctRemaining)}%`}
        </span>
      </div>
      <div className="flex flex-col">
        <span className={`text-xs ${textClass}`}>
          {isBreached
            ? t('incidentDetail.slaBreached', { time: fmt(msRemaining) })
            : t('incidentDetail.slaResolveIn', { time: fmt(msRemaining) })}
        </span>
        <span className="text-[10px] text-surface-400 leading-tight">
          {t('incidentDetail.slaDue', { time: due.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) })}
        </span>
      </div>
    </div>
  )
}

// ─── Structured Description ───────────────────────────────────────────────────

const KEY_RE = /^([A-Za-z][A-Za-z ]{0,39}):\s*(.*)$/

function parseStructuredDescription(text: string): Map<string, string> | null {
  const lines = text.split('\n')
  const kvCount = lines.filter(l => KEY_RE.test(l)).length
  if (kvCount < 3) return null

  const result = new Map<string, string>()
  let currentKey: string | null = null
  let currentValue: string[] = []

  for (const line of lines) {
    const m = line.match(KEY_RE)
    if (m) {
      if (currentKey !== null) result.set(currentKey, currentValue.join('\n').trim())
      currentKey = m[1].trim()
      currentValue = m[2].trim() ? [m[2].trim()] : []
    } else if (currentKey !== null && line.trim()) {
      currentValue.push(line.trim())
    }
  }
  if (currentKey !== null) result.set(currentKey, currentValue.join('\n').trim())

  for (const [k, v] of result) {
    if (!v) result.delete(k)
  }

  return result.size >= 2 ? result : null
}

function StatusChip({ value }: { value: string }) {
  const up = value.toUpperCase()
  if (value.length > 60) return <span className="text-xs text-surface-700">{value}</span>
  if (up.includes('FAIL') || up.includes('ERROR')) {
    return (
      <span className="inline-flex text-2xs font-bold px-1.5 py-0.5 bg-red-50 border border-red-200 text-red-700" style={{ borderRadius: 3 }}>
        {value}
      </span>
    )
  }
  if (up === 'SUCCESS' || up === 'OK' || up === 'RESOLVED') {
    return (
      <span className="inline-flex text-2xs font-bold px-1.5 py-0.5 bg-green-50 border border-green-200 text-green-700" style={{ borderRadius: 3 }}>
        {value}
      </span>
    )
  }
  if (value === 'unknown' || value === 'UNKNOWN' || value === 'N/A') {
    return <span className="text-xs text-surface-400 italic">{value}</span>
  }
  return <span className="text-xs text-surface-700">{value}</span>
}

const SUGGESTED_FIX_KEYS = new Set(['Suggested Fix', 'Fix', 'Recommendation', 'Resolution Suggestion'])

function StructuredDescription({ text }: { text: string }) {
  const [fixExpanded, setFixExpanded] = useState(false)

  const parsed = useMemo(() => parseStructuredDescription(text), [text])

  if (!parsed) {
    return <p className="text-xs text-surface-700 whitespace-pre-wrap leading-relaxed">{text}</p>
  }

  let fixKey: string | null = null
  let fixValue: string | null = null
  for (const k of SUGGESTED_FIX_KEYS) {
    if (parsed.has(k)) { fixKey = k; fixValue = parsed.get(k)!; break }
  }

  const fields = [...parsed.entries()].filter(([k]) => k !== fixKey)

  return (
    <div className="flex flex-col gap-3">
      {/* Field grid */}
      <div className="grid gap-x-4 gap-y-1.5" style={{ gridTemplateColumns: 'max-content 1fr' }}>
        {fields.map(([key, value]) => (
          <React.Fragment key={key}>
            <span className="text-2xs font-semibold text-surface-400 uppercase tracking-wider whitespace-nowrap pt-0.5">
              {key}
            </span>
            <StatusChip value={value} />
          </React.Fragment>
        ))}
      </div>

      {/* Suggested Fix callout */}
      {fixKey && fixValue && (
        <div className="border border-amber-200 bg-amber-50/40" style={{ borderRadius: 4 }}>
          <button
            type="button"
            onClick={() => setFixExpanded(v => !v)}
            className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-amber-50/60 transition-colors"
          >
            <div className="flex items-center gap-1.5">
              <Lightbulb size={11} className="text-amber-600 flex-none" />
              <span className="text-2xs font-semibold text-amber-700 uppercase tracking-wider">
                {fixKey}
              </span>
            </div>
            <ChevronDown
              size={11}
              className="text-amber-400 flex-none transition-transform"
              style={{ transform: fixExpanded ? 'rotate(180deg)' : 'none' }}
            />
          </button>
          {fixExpanded && (
            <div className="px-3 pb-3 border-t border-amber-100">
              <p className="text-xs text-surface-700 whitespace-pre-wrap leading-relaxed mt-2">
                {fixValue}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function EventItem({ event, userMap }: { event: IncidentEvent; userMap: Record<string, string> }) {
  const { t } = useTranslation()
  const actor = userMap[event.actor_id] ?? `${event.actor_id.slice(0, 8)}…`
  const when = relativeTime(event.created_at)
  const meta = (event.event_metadata ?? {}) as Record<string, string>

  let iconNode: React.ReactNode = null
  let bodyNode: React.ReactNode = null

  if (event.event_type === 'comment' || event.event_type === 'work_note') {
    const isWork = event.event_type === 'work_note'
    iconNode = isWork ? (
      <div className="w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-950/40 text-amber-600 border border-amber-200 dark:border-amber-900/60 flex items-center justify-center">
        <Lock size={11} />
      </div>
    ) : (
      <div className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700 flex items-center justify-center">
        <MessageSquare size={11} />
      </div>
    )

    bodyNode = (
      <div
        className="p-3"
        style={{
          background: isWork ? 'rgba(245,158,11,0.04)' : 'var(--bg-secondary)',
          border: `1px solid ${isWork ? 'rgba(245,158,11,0.22)' : 'var(--border-color)'}`,
          borderLeft: `3px solid ${isWork ? '#f59e0b' : '#94a3b8'}`,
          borderRadius: 4,
          boxShadow: isWork ? '0 2px 8px rgba(245,158,11,0.04)' : 'none',
        }}
      >
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-xs font-semibold text-surface-700">{actor}</span>
          {isWork && (
            <span
              style={{
                fontSize: 9, fontWeight: 700, letterSpacing: '0.04em',
                padding: '1px 4px', borderRadius: '3px',
                background: 'rgba(245,158,11,0.12)',
                border: '1px solid rgba(245,158,11,0.28)',
                color: '#92400e',
              }}
            >
              {t('incidentDetail.workNoteLabel')}
            </span>
          )}
          <span className="ml-auto text-2xs text-surface-400">{when}</span>
        </div>
        <p className="text-xs text-surface-700 whitespace-pre-wrap leading-relaxed">{event.body}</p>
      </div>
    )
  } else if (event.event_type === 'state_change') {
    const from = meta.from_state ?? '?'
    const to = meta.to_state ?? '?'
    function toTitle(s: string) { return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) }
    
    iconNode = (
      <div className="w-6 h-6 rounded-full bg-violet-100 dark:bg-violet-950/40 text-violet-600 border border-violet-200 dark:border-violet-900/60 flex items-center justify-center">
        <ArrowRight size={11} />
      </div>
    )

    bodyNode = (
      <div className="flex items-center gap-2 text-2xs text-surface-500 py-1" style={{ minHeight: 24 }}>
        <span>
          <span className="font-semibold text-surface-600">{actor}</span>
          {' '}{t('incidentDetail.changedState')}{' '}
          <span className="font-semibold text-surface-600">{toTitle(from)}</span>
          {' → '}
          <span className="font-semibold text-surface-700">{toTitle(to)}</span>
          {event.body ? <span className="text-surface-400 ml-1">· {event.body}</span> : null}
        </span>
        <span className="ml-auto whitespace-nowrap">{when}</span>
      </div>
    )
  } else if (event.event_type === 'field_update') {
    const isCreated = meta.action === 'created'
    iconNode = isCreated ? (
      <div className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 border border-emerald-200 dark:border-emerald-900/60 flex items-center justify-center">
        <UserPlus size={11} />
      </div>
    ) : (
      <div className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-200 dark:border-slate-700 flex items-center justify-center">
        <FileText size={11} />
      </div>
    )

    if (isCreated) {
      bodyNode = (
        <div className="flex items-center gap-2 text-2xs text-surface-500 py-1" style={{ minHeight: 24 }}>
          <span><span className="font-semibold text-surface-600">{actor}</span> {t('incidentDetail.createdIncident')}</span>
          <span className="ml-auto whitespace-nowrap">{when}</span>
        </div>
      )
    } else {
      bodyNode = (
        <div className="flex items-start gap-2 text-2xs text-surface-500 py-1" style={{ minHeight: 24 }}>
          <span>
            <span className="font-semibold text-surface-600">{actor}</span>
            {' '}{t('incidentDetail.updatedField')} <span className="font-semibold">{meta.field}</span>
            {meta.old && meta.new ? (
              <span className="text-surface-400"> ({meta.old} → {meta.new})</span>
            ) : null}
          </span>
          <span className="ml-auto whitespace-nowrap">{when}</span>
        </div>
      )
    }
  } else if (event.event_type === 'attachment_added' || event.event_type === 'attachment_deleted') {
    const verb = event.event_type === 'attachment_added' ? t('incidentDetail.addedAttachment') : t('incidentDetail.removedAttachment')
    iconNode = (
      <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-950/40 text-blue-600 border border-blue-200 dark:border-blue-900/60 flex items-center justify-center">
        <FileUp size={11} />
      </div>
    )

    bodyNode = (
      <div className="flex items-center gap-2 text-2xs text-surface-500 py-1" style={{ minHeight: 24 }}>
        <span><span className="font-semibold text-surface-600">{actor}</span> {verb}</span>
        <span className="ml-auto whitespace-nowrap">{when}</span>
      </div>
    )
  }

  if (!bodyNode) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
      className="relative pl-9 pb-1"
    >
      <div className="absolute left-1.5 top-0.5 z-10">
        {iconNode}
      </div>
      <div>
        {bodyNode}
      </div>
    </motion.div>
  )
}

export default function IncidentDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { t } = useTranslation()

  const { data: incident, isLoading, error } = useIncident(id!)
  const { data: me } = useMe()
  const { data: priorities } = usePriorities()
  const { data: categories } = useCategories()
  const { data: statesConfig } = useStates()
  const resolutionCodes = useResolutionCodes()

  const isAgent = me?.scopes?.includes('Agent') ?? false
  const { data: allUsers } = useUsers(undefined, isAgent)

  const { presence, lockField, unlockField, lockedBy } = useCollaboration(id!, me?.user_id)

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

  const [aiPanelOpen, setAiPanelOpen] = useState(false)
  const { data: aiStatus } = useAIStatus()
  const aiEnabled = !!(aiStatus?.ai_enabled && aiStatus?.has_key)
  const {
    data: similarIncs,
    isLoading: similarLoading,
    error: similarError,
  } = useSimilarIncidents(id!, aiPanelOpen && aiEnabled)

  const summarizeMut = useSummarizeIncident()
  const draftReplyMut = useDraftReply()
  const draftResMut = useDraftResolution()

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

  const primaryTransitions = useMemo(() => {
    const primary = PRIMARY_TRANSITIONS[incident?.state ?? ''] ?? []
    return validTransitions.filter(t => primary.includes(t))
  }, [validTransitions, incident?.state])

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
    unlockField('title')
  }

  function saveDesc() {
    if (descDraft !== incident?.description) {
      patchMut.mutate({ description: descDraft })
    }
    setEditDesc(false)
    unlockField('description')
  }

  function submitComment() {
    if (!commentText.trim()) return
    commentMut.mutate({ event_type: commentTab, body: commentText.trim() })
  }

  if (isLoading) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        {/* Header skeleton */}
        <div className="flex-none flex items-center gap-3 px-4 bg-white border-b border-surface-200" style={{ height: 44 }}>
          <Skeleton height={10} width={60} />
          <Skeleton height={10} width={1} />
          <Skeleton height={14} width={180} />
        </div>
        {/* Body skeleton */}
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4">
            <Skeleton height={14} width="60%" />
            <Skeleton height={60} />
            <div className="grid grid-cols-2 gap-4">
              <Skeleton height={30} />
              <Skeleton height={30} />
            </div>
            <Skeleton height={80} />
          </div>
          <div className="flex-none border-l border-surface-200 overflow-y-auto px-4 py-4 flex flex-col gap-3" style={{ width: 240 }}>
            {[70, 50, 50, 60, 50].map((w, i) => <Skeleton key={i} height={24} width={w} />)}
          </div>
        </div>
      </div>
    )
  }

  if (error || !incident) {
    return (
      <div className="flex-1 flex items-center justify-center gap-2 text-xs text-red-600">
        {t('incidentDetail.failedToLoad')}
        <button onClick={() => navigate('/incidents')} className="underline text-surface-600">
          {t('incidentDetail.backToList')}
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
          {t('incidentDetail.breadcrumb')}
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
              if (e.key === 'Escape') { setEditTitle(false); unlockField('title') }
            }}
            className="flex-1 font-semibold bg-transparent border-b border-surface-400 focus:outline-none focus:border-surface-700 min-w-0"
            style={{ fontSize: 15 }}
          />
        ) : (
          <span
            className={`flex-1 font-semibold text-surface-900 truncate ${isAgent && !isClosed && !lockedBy('title') ? 'cursor-pointer hover:text-surface-600' : ''}`}
            style={{ fontSize: 15 }}
            onClick={() => {
              if (isAgent && !isClosed && !lockedBy('title')) {
                setTitleDraft(incident.title)
                setEditTitle(true)
                lockField('title')
              }
            }}
            title={incident.title}
          >
            {incident.title}
          </span>
        )}

        {/* Presence avatars */}
        {presence.length > 0 && (
          <div className="flex items-center flex-none" style={{ marginRight: 2 }}>
            {presence.slice(0, 4).map((user, i) => {
              const initials = user.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
              const isEditing = !!user.editing_field
              const fieldLabel = user.editing_field?.replace(/_/g, ' ') ?? ''
              return (
                <div
                  key={user.user_id}
                  title={isEditing ? `${user.name} — editing ${fieldLabel}` : user.name}
                  style={{
                    position: 'relative', width: 22, height: 22, borderRadius: '50%',
                    background: user.color, color: '#fff',
                    fontSize: 9, fontWeight: 700, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: '2px solid #fff',
                    marginLeft: i === 0 ? 0 : -6,
                    zIndex: 10 - i,
                    boxShadow: isEditing
                      ? `0 0 0 2px ${user.color}66`
                      : '0 1px 3px rgba(0,0,0,0.14)',
                    cursor: 'default',
                  }}
                >
                  {initials}
                  {isEditing && (
                    <span
                      className="animate-ping"
                      style={{
                        position: 'absolute', inset: -3, borderRadius: '50%',
                        border: `2px solid ${user.color}`,
                        opacity: 0.55, pointerEvents: 'none',
                      }}
                    />
                  )}
                </div>
              )
            })}
            {presence.length > 4 && (
              <div style={{
                width: 22, height: 22, borderRadius: '50%',
                background: '#e2e8f0', color: '#475569', fontSize: 9, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '2px solid #fff', marginLeft: -6, flexShrink: 0, zIndex: 6,
              }}>
                +{presence.length - 4}
              </div>
            )}
          </div>
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

          {aiEnabled && (
            <button
              type="button"
              onClick={() => setAiPanelOpen(v => !v)}
              className={`flex items-center gap-1 text-xs border px-2 py-0.5 transition-colors ${
                aiPanelOpen
                  ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                  : 'border-surface-200 text-surface-600 hover:bg-surface-50 hover:text-surface-800'
              }`}
              style={{ borderRadius: 2 }}
            >
              <Brain size={11} className="flex-none" />
              {t('incidentDetail.aiHelp')}
            </button>
          )}
        </div>
      </div>

      {/* Status progress stepper */}
      <StatusStepper currentState={incident.state} />

      {/* Resolution form strip */}
      {showResForm && (
        <div className="flex-none border-b border-amber-200 px-4 py-3" style={{ background: 'rgba(245,158,11,0.05)' }}>
          <div className="flex items-start gap-4 max-w-3xl">
            <div className="flex-1 min-w-0">
              <div className="text-2xs font-semibold text-surface-400 uppercase tracking-wider mb-1">{t('incidentDetail.resolutionCodeLabel')}</div>
              <select
                value={resCode}
                onChange={e => setResCode(e.target.value)}
                className="w-full text-xs border border-surface-200 bg-white px-2 py-1 focus:outline-none focus:border-surface-400"
                style={{ borderRadius: 2 }}
              >
                <option value="">{t('incidentDetail.resolutionCodeLabel')}</option>
                {resolutionCodes.map(code => (
                  <option key={code} value={code}>{code}</option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-2xs font-semibold text-surface-400 uppercase tracking-wider mb-1">{t('incidentDetail.resolutionNotesLabel')}</div>
              <textarea
                value={resNotes}
                onChange={e => setResNotes(e.target.value)}
                rows={2}
                placeholder={t('incidentDetail.resolutionNotesPlaceholder')}
                className="w-full text-xs border border-surface-200 bg-white px-2 py-1 focus:outline-none focus:border-surface-400 resize-none"
                style={{ borderRadius: 2 }}
              />
              {aiEnabled && (
                <button
                  type="button"
                  onClick={async () => {
                    const r = await draftResMut.mutateAsync(id!)
                    setResNotes(r.notes)
                  }}
                  disabled={draftResMut.isPending}
                  className="mt-1 flex items-center gap-1 text-2xs text-indigo-600 hover:text-indigo-800 disabled:opacity-50 transition-colors"
                >
                  <Brain size={10} className="flex-none" />
                  {draftResMut.isPending ? t('incidentDetail.drafting') : t('incidentDetail.draftWithAI')}
                </button>
              )}
            </div>
            <div className="flex flex-col gap-1.5 pt-5 flex-none">
              <SpinButton
                onClick={handleResolve}
                disabled={!resCode || !resNotes.trim()}
                isLoading={transitionMut.isPending}
                className="text-xs font-medium px-3 py-1 bg-surface-800 text-white hover:bg-surface-700 disabled:opacity-40 transition-colors"
                style={{ borderRadius: 2 }}
              >
                {transitionMut.isPending ? t('incidentDetail.resolving') : t('incidentDetail.markResolved')}
              </SpinButton>
              <button
                onClick={() => { setShowResForm(false); setResCode(''); setResNotes('') }}
                className="text-xs text-surface-500 hover:text-surface-700 text-center"
              >
                {t('incidentDetail.cancel')}
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
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xs font-semibold text-surface-400 uppercase tracking-wider">{t('incidentDetail.description')}</span>
              {isAgent && !isClosed && !lockedBy('description') && !editDesc && (
                <button
                  onClick={() => {
                    setDescDraft(incident.description)
                    setEditDesc(true)
                    lockField('description')
                  }}
                  className="flex items-center gap-1 text-2xs text-surface-400 hover:text-surface-600 transition-colors"
                >
                  <Pencil size={10} />
                  {t('incidentDetail.edit')}
                </button>
              )}
            </div>
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
                  <SpinButton
                    onClick={saveDesc}
                    isLoading={patchMut.isPending}
                    className="text-xs font-medium px-3 py-1 bg-surface-800 text-white hover:bg-surface-700 disabled:opacity-40"
                    style={{ borderRadius: 2 }}
                  >
                    {patchMut.isPending ? t('incidentDetail.saving') : t('incidentDetail.save')}
                  </SpinButton>
                  <button
                    onClick={() => { setEditDesc(false); unlockField('description') }}
                    className="text-xs text-surface-500 hover:text-surface-700"
                  >
                    {t('incidentDetail.cancel')}
                  </button>
                </div>
              </div>
            ) : (
              <>
                {lockedBy('description') && (
                  <div style={{ marginBottom: 6 }}>
                    <LockedByBadge user={lockedBy('description')!} />
                  </div>
                )}
                <div>
                  {incident.description
                    ? <StructuredDescription text={incident.description} />
                    : <span className="text-surface-400 italic text-xs">{t('incidentDetail.noDescription')}</span>
                  }
                </div>
              </>
            )}
          </div>



          {/* Activity */}
          <div className="flex-1" style={{ paddingLeft: 20, paddingRight: 20, paddingTop: 12, paddingBottom: 8 }}>
            <div className="text-2xs font-semibold text-surface-400 uppercase tracking-wider mb-3">{t('incidentDetail.activity')}</div>
            {incident.events.length === 0 ? (
              <div className="text-xs text-surface-400 italic">{t('incidentDetail.noActivity')}</div>
            ) : (
              <div className="timeline-thread pl-1" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
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
                      {tab === 'comment' ? t('incidentDetail.comment') : t('incidentDetail.workNote')}
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
                placeholder={commentTab === 'work_note' ? t('incidentDetail.workNotePlaceholder') : t('incidentDetail.commentPlaceholder')}
                className="w-full text-xs border border-surface-200 bg-white focus:outline-none focus:border-surface-400"
                style={{ height: commentFocused ? 120 : 56, resize: 'none', padding: 8, borderRadius: 2 }}
              />
              <div className="flex items-center justify-between mt-1.5">
                {aiEnabled ? (
                  <button
                    type="button"
                    onClick={async () => {
                      const r = await draftReplyMut.mutateAsync(id!)
                      setCommentText(r.draft)
                    }}
                    disabled={draftReplyMut.isPending}
                    className="flex items-center gap-1 text-2xs text-indigo-600 hover:text-indigo-800 disabled:opacity-50 transition-colors"
                  >
                    {draftReplyMut.isPending ? (
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }}
                        style={{ width: 10, height: 10, flexShrink: 0 }}
                      >
                        <Brain size={10} />
                      </motion.div>
                    ) : (
                      <Brain size={10} className="flex-none" />
                    )}
                    {draftReplyMut.isPending ? (
                      <span className="flex items-center gap-0.5">
                        {t('incidentDetail.drafting')}
                        {[0, 1, 2].map(i => (
                          <motion.span
                            key={i}
                            animate={{ opacity: [0, 1, 0] }}
                            transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2, ease: 'easeInOut' }}
                            style={{ display: 'inline-block' }}
                          >·</motion.span>
                        ))}
                      </span>
                    ) : t('incidentDetail.draftReply')}
                  </button>
                ) : <span />}
                <SpinButton
                  onClick={submitComment}
                  disabled={!commentText.trim()}
                  isLoading={commentMut.isPending}
                  className="text-xs font-medium bg-surface-700 text-white hover:bg-surface-800 disabled:opacity-40 transition-colors"
                  style={{ height: 28, padding: '0 8px', borderRadius: 2 }}
                >
                  {commentMut.isPending ? t('incidentDetail.posting') : t('incidentDetail.post')}
                </SpinButton>
              </div>
            </div>
          )}
        </div>

        {/* Right — fields panel */}
        <div
          className="flex-none overflow-y-auto border-l border-surface-200 bg-surface-50 px-4 py-4"
          style={{ width: 236 }}
        >
          {/* Status transitions */}
          {(isAgent && !isClosed) && (
            <FieldSection label={t('incidentDetail.fieldStatus')}>
              <div className="flex flex-col gap-1.5">
                {transitionMut.isPending ? (
                  <div className="flex items-center gap-1.5 text-xs text-surface-500 py-0.5">
                    <Loader2 size={11} className="animate-spin flex-none" />
                    {t('incidentDetail.saving')}
                  </div>
                ) : (
                  <>
                    {primaryTransitions.map(toState => {
                      const color = STEPPER_META[toState]?.color ?? '#475569'
                      return (
                        <button
                          key={toState}
                          onClick={() => handleTransitionClick(toState)}
                          className="flex items-center justify-between w-full text-xs px-2.5 py-1.5 border transition-colors hover:opacity-80"
                          style={{ borderRadius: 2, borderColor: `${color}40`, color, background: `${color}0d` }}
                        >
                          <span>{TRANSITION_LABELS[toState] ?? toState.replace(/_/g, ' ')}</span>
                          <ArrowRight size={10} className="flex-none" />
                        </button>
                      )
                    })}
                    {validTransitions.filter(t => !primaryTransitions.includes(t)).length > 0 && (
                      <div className="relative">
                        <button
                          onClick={() => setTransitionOpen(v => !v)}
                          className="flex items-center gap-1 text-2xs text-surface-400 hover:text-surface-600 transition-colors"
                        >
                          <ChevronDown
                            size={10}
                            style={{ transition: 'transform 0.15s', transform: transitionOpen ? 'rotate(180deg)' : 'none' }}
                          />
                          {t('incidentDetail.moreTransitions')}
                        </button>
                        {transitionOpen && (
                          <>
                            <div className="fixed inset-0 z-[9]" onClick={() => setTransitionOpen(false)} />
                            <div
                              className="absolute left-0 top-full mt-1 bg-white border border-surface-200 shadow-lg z-10 py-1"
                              style={{ borderRadius: 4, minWidth: 160 }}
                            >
                              {validTransitions.filter(t => !primaryTransitions.includes(t)).map(toState => (
                                <button
                                  key={toState}
                                  onClick={() => handleTransitionClick(toState)}
                                  className="flex items-center gap-2 w-full text-left px-3 py-2 text-xs text-surface-700 hover:bg-surface-50"
                                >
                                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: STEPPER_META[toState]?.color ?? '#94a3b8', flexShrink: 0 }} />
                                  {TRANSITION_LABELS[toState] ?? toState.replace(/_/g, ' ')}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </FieldSection>
          )}

          {canClose && (
            <FieldSection label={t('incidentDetail.fieldStatus')}>
              <SpinButton
                onClick={() => transitionMut.mutate({ to_state: 'closed' })}
                isLoading={transitionMut.isPending}
                className="w-full text-xs border border-surface-200 px-2 py-1.5 hover:bg-surface-50 text-surface-600 hover:text-surface-800 transition-colors disabled:opacity-50"
                style={{ borderRadius: 2 }}
              >
                {transitionMut.isPending ? t('incidentDetail.closing') : t('incidentDetail.closeIncident')}
              </SpinButton>
            </FieldSection>
          )}

          <div className="border-t border-surface-100 mb-1" />

          <FieldSection label={t('incidentDetail.fieldPriority')}>
            {isAgent && !isClosed && lockedBy('priority') ? (
              <>
                <PriorityBadge priority={incident.priority} priorities={priorities} />
                <div style={{ marginTop: 4 }}><LockedByBadge user={lockedBy('priority')!} /></div>
              </>
            ) : isAgent && !isClosed ? (
              <select
                value={incident.priority}
                onChange={e => patchMut.mutate({ priority: Number(e.target.value) })}
                onFocus={() => lockField('priority')}
                onBlur={() => unlockField('priority')}
                className="w-full text-xs border border-surface-200 bg-white px-2 py-1 focus:outline-none focus:border-surface-400"
                style={{ borderRadius: 2 }}
              >
                {priorities?.map(p => (
                  <option key={p.level} value={p.level}>{p.name}</option>
                )) ?? [0, 1, 2, 3, 4].map(n => <option key={n} value={n}>P{n}</option>)}
              </select>
            ) : (
              <PriorityBadge priority={incident.priority} priorities={priorities} />
            )}
          </FieldSection>

          <FieldSection label={t('incidentDetail.fieldCategory')}>
            {isAgent && !isClosed && lockedBy('category') ? (
              <>
                <span className="text-surface-800">{incident.category}</span>
                <div style={{ marginTop: 4 }}><LockedByBadge user={lockedBy('category')!} /></div>
              </>
            ) : isAgent && !isClosed ? (
              <select
                value={incident.category}
                onChange={e => patchMut.mutate({ category: e.target.value })}
                onFocus={() => lockField('category')}
                onBlur={() => unlockField('category')}
                className="w-full text-xs border border-surface-200 bg-white px-2 py-1 focus:outline-none focus:border-surface-400"
                style={{ borderRadius: 2 }}
              >
                {categories?.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            ) : (
              <span className="text-surface-800">{incident.category}</span>
            )}
          </FieldSection>

          <FieldSection label={t('incidentDetail.fieldAssignee')}>
            {isAgent && !isClosed && lockedBy('assignee') ? (
              <>
                <span className="text-surface-800">
                  {incident.assignee?.name ?? <span className="text-surface-400">{t('incidentDetail.unassigned')}</span>}
                </span>
                <div style={{ marginTop: 4 }}><LockedByBadge user={lockedBy('assignee')!} /></div>
              </>
            ) : isAgent && !isClosed ? (
              <select
                value={incident.assignee_id ?? ''}
                onChange={e => patchMut.mutate({ assignee_id: e.target.value || null })}
                onFocus={() => lockField('assignee')}
                onBlur={() => unlockField('assignee')}
                className="w-full text-xs border border-surface-200 bg-white px-2 py-1 focus:outline-none focus:border-surface-400"
                style={{ borderRadius: 2 }}
              >
                <option value="">{t('incidentDetail.unassigned')}</option>
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

          <FieldSection label={t('incidentDetail.fieldRequester')}>
            <span className="text-xs text-surface-800 font-medium">{incident.requester.name}</span>
            <div className="text-2xs text-surface-400 mt-0.5">{incident.requester.email}</div>
          </FieldSection>

          <FieldSection label={t('incidentDetail.fieldSource')}>
            <span className="text-surface-800 capitalize">{incident.source.replace(/_/g, ' ')}</span>
          </FieldSection>

          <div className="border-t border-surface-200 my-2" />

          <FieldSection label={t('incidentDetail.fieldSlaDue')}>
            <SlaValue
              sla_resolution_due={incident.sla_resolution_due}
              sla_breached={incident.sla_breached}
              state={incident.state}
              created_at={incident.created_at}
            />
          </FieldSection>

          <div className="border-t border-surface-200 my-2" />

          <FieldSection label={t('incidentDetail.fieldCreated')}>
            <span className="text-surface-800" title={incident.created_at}>
              {relativeTime(incident.created_at)}
            </span>
          </FieldSection>

          <FieldSection label={t('incidentDetail.fieldUpdated')}>
            <span className="text-surface-800" title={incident.updated_at}>
              {relativeTime(incident.updated_at)}
            </span>
          </FieldSection>

          {incident.resolved_at && (
            <FieldSection label={t('incidentDetail.fieldResolved')}>
              <span className="text-surface-800" title={incident.resolved_at}>
                {relativeTime(incident.resolved_at)}
              </span>
            </FieldSection>
          )}

          {incident.closed_at && (
            <FieldSection label={t('incidentDetail.fieldClosed')}>
              <span className="text-surface-800" title={incident.closed_at}>
                {relativeTime(incident.closed_at)}
              </span>
            </FieldSection>
          )}

          {isResolved && incident.resolution_code && (
            <>
              <div className="border-t border-surface-200 my-2" />
              <FieldSection label={t('incidentDetail.fieldResolutionCode')}>
                <span className="text-surface-800">{incident.resolution_code}</span>
              </FieldSection>
              {incident.resolution_notes && (
                <FieldSection label={t('incidentDetail.fieldResolutionNotes')}>
                  <p className="text-surface-800 whitespace-pre-wrap leading-relaxed">{incident.resolution_notes}</p>
                </FieldSection>
              )}
            </>
          )}
        </div>
      </div>

      {/* Sliding AI Panel Drawer */}
      <AnimatePresence>
        {aiPanelOpen && aiEnabled && (
          <>
            {/* Backdrop Blur overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.35 }}
              exit={{ opacity: 0 }}
              onClick={() => setAiPanelOpen(false)}
              className="fixed inset-0 bg-slate-900 z-40 cursor-pointer"
            />
            {/* Drawer */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 220 }}
              className="fixed top-0 right-0 h-full w-[440px] bg-white dark:bg-slate-950 border-l border-indigo-200 dark:border-indigo-900/60 shadow-2xl z-50 flex flex-col no-theme-transition backdrop-glass"
            >
              {/* Drawer Header */}
              <div className="flex-none flex items-center justify-between px-4 border-b border-indigo-100 dark:border-indigo-950/50" style={{ height: 48 }}>
                <div className="flex items-center gap-2">
                  <Brain size={14} className="text-indigo-600 dark:text-indigo-400 animate-pulse" />
                  <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-400 uppercase tracking-wider">{t('incidentDetail.aiCoPilot')}</span>
                </div>
                <button
                  onClick={() => setAiPanelOpen(false)}
                  className="text-surface-400 hover:text-surface-600 text-xs px-2 py-1 rounded hover:bg-surface-100 dark:hover:bg-slate-800 transition-colors"
                >
                  {t('incidentDetail.close')}
                </button>
              </div>

              {/* Drawer Content */}
              <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-5 bg-transparent">
                {/* AI Summary Section */}
                <div className="bg-slate-50/50 dark:bg-slate-900/40 p-3 rounded-lg border border-slate-200/60 dark:border-slate-800/80">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-2xs font-bold text-surface-500 uppercase tracking-wider">{t('incidentDetail.threadSummary')}</span>
                    {!summarizeMut.data && !summarizeMut.isPending && (
                      <button
                        onClick={() => summarizeMut.mutate(id!)}
                        className="text-2xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 font-semibold border border-indigo-200 dark:border-indigo-800/80 px-2.5 py-0.5 rounded bg-white dark:bg-slate-950 hover:bg-indigo-50/30 transition-all shadow-sm"
                      >
                        {t('incidentDetail.summarizeThread')}
                      </button>
                    )}
                    {summarizeMut.data && (
                      <button onClick={() => summarizeMut.reset()} className="text-2xs text-surface-400 hover:text-surface-600 font-medium">
                        {t('incidentDetail.clear')}
                      </button>
                    )}
                  </div>

                  {summarizeMut.isPending && (
                    <div className="flex items-center gap-2 text-xs text-surface-500 py-2">
                      <Loader2 size={12} className="animate-spin text-indigo-500" />
                      {t('incidentDetail.synthesizing')}
                    </div>
                  )}

                  {summarizeMut.isError && <div className="text-xs text-red-500 py-1">{t('incidentDetail.summaryFailed')}</div>}

                  {summarizeMut.data?.summary && (
                    <div className="text-xs text-surface-700 dark:text-surface-300 leading-relaxed bg-white/70 dark:bg-slate-950/60 p-2.5 rounded border border-indigo-100/50 dark:border-indigo-900/30 shadow-sm">
                      {summarizeMut.data.summary}
                    </div>
                  )}

                  {!summarizeMut.data && !summarizeMut.isPending && !summarizeMut.isError && (
                    <p className="text-xs text-surface-400 italic">{t('incidentDetail.summaryHint')}</p>
                  )}
                </div>

                {/* Similar Incidents Section */}
                <div className="flex-1 flex flex-col min-h-0">
                  <span className="text-2xs font-bold text-surface-500 uppercase tracking-wider mb-2 block">{t('incidentDetail.similarIncidents')}</span>
                  <div className="flex-1 overflow-y-auto pr-1">
                    {similarLoading ? (
                      <div className="flex items-center gap-2 text-xs text-surface-500 py-2">
                        <Loader2 size={13} className="animate-spin text-indigo-500" />
                        {t('incidentDetail.analyzingClusters')}
                      </div>
                    ) : similarError ? (
                      <div className="text-xs text-red-500">{t('incidentDetail.similarFailed')}</div>
                    ) : !similarIncs?.length ? (
                      <div className="text-xs text-surface-400 italic py-2">{t('incidentDetail.noSimilar')}</div>
                    ) : (
                      <div className="flex flex-col gap-3">
                        {similarIncs.map(sim => (
                          <div
                            key={sim.id}
                            className="bg-white/60 dark:bg-slate-900/30 border border-slate-200/80 dark:border-slate-800/80 rounded-lg p-3 hover:border-indigo-300 dark:hover:border-indigo-800 transition-all shadow-sm"
                          >
                            <div className="flex items-start gap-2 mb-1.5 justify-between">
                              <span className="font-mono text-2xs bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/60 px-2 py-0.5 rounded text-indigo-600 dark:text-indigo-400 font-semibold">
                                {sim.number}
                              </span>
                            </div>
                            <span className="text-xs font-semibold text-surface-800 dark:text-surface-200 leading-tight block mb-1">{sim.title}</span>
                            <p className="text-2xs text-surface-500 leading-relaxed mb-2 bg-slate-50/50 dark:bg-slate-950/30 p-1.5 rounded">{sim.similarity_reason}</p>
                            {sim.resolution_summary && (
                              <div className="text-2xs text-surface-700 dark:text-surface-300 leading-relaxed border-t border-slate-100 dark:border-slate-800/80 pt-2 mt-2">
                                <span className="font-bold text-indigo-600 dark:text-indigo-400">{t('incidentDetail.provenResolution')} </span>
                                {sim.resolution_summary}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
