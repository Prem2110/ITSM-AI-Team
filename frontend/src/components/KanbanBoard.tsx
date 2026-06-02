import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import type { IncidentListItem } from '@/types'
import type { Priority } from '@/types'
import { useResolutionCodes } from '@/hooks'

const KANBAN_COLUMNS = [
  { key: 'new',         label: 'New',         color: '#1d4ed8', bg: 'rgba(37,99,235,0.04)',   border: 'rgba(37,99,235,0.13)' },
  { key: 'assigned',    label: 'Assigned',     color: '#7c3aed', bg: 'rgba(109,40,217,0.04)',  border: 'rgba(109,40,217,0.13)' },
  { key: 'in_progress', label: 'In Progress',  color: '#a16207', bg: 'rgba(202,138,4,0.04)',   border: 'rgba(202,138,4,0.13)' },
  { key: 'on_hold',     label: 'On Hold',      color: '#475569', bg: 'rgba(100,116,139,0.04)', border: 'rgba(100,116,139,0.13)' },
  { key: 'resolved',    label: 'Resolved',     color: '#15803d', bg: 'rgba(22,163,74,0.04)',   border: 'rgba(22,163,74,0.13)' },
] as const

const PRIORITY_COLORS: Record<number, string> = {
  0: '#7f1d1d',
  1: '#dc2626',
  2: '#ea580c',
  3: '#ca8a04',
  4: '#16a34a',
}

interface Props {
  items: IncidentListItem[]
  priorities: Priority[]
  validTransitionsMap: Record<string, string[]>
  onTransition: (id: string, toState: string, resCode?: string, resNotes?: string) => Promise<void>
  isAgent: boolean
}

export function KanbanBoard({ items, priorities, validTransitionsMap, onTransition, isAgent }: Props) {
  const navigate = useNavigate()
  const resolutionCodes = useResolutionCodes()

  const [dragInfo, setDragInfo] = useState<{ id: string; fromState: string } | null>(null)
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)
  const [transitioning, setTransitioning] = useState<Set<string>>(new Set())

  const [resolveSheet, setResolveSheet] = useState<{ id: string } | null>(null)
  const [resCode, setResCode] = useState('')
  const [resNotes, setResNotes] = useState('')
  const [resolving, setResolving] = useState(false)
  const [resolveError, setResolveError] = useState('')

  // Per-column drag-enter counter to prevent dragLeave flicker on child elements
  const dragCounters = useRef<Record<string, number>>({})

  const byState: Record<string, IncidentListItem[]> = {}
  for (const col of KANBAN_COLUMNS) {
    byState[col.key] = items.filter(i => i.state === col.key)
  }

  function isValidDrop(toState: string) {
    if (!dragInfo) return false
    if (dragInfo.fromState === toState) return false
    return (validTransitionsMap[dragInfo.fromState] ?? []).includes(toState)
  }

  function handleDragStart(e: React.DragEvent, item: IncidentListItem) {
    setDragInfo({ id: item.id, fromState: item.state })
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', item.id)
  }

  function handleDragEnd() {
    setDragInfo(null)
    setDragOverCol(null)
    dragCounters.current = {}
  }

  function handleColDragEnter(e: React.DragEvent, colKey: string) {
    dragCounters.current[colKey] = (dragCounters.current[colKey] ?? 0) + 1
    if (isValidDrop(colKey)) {
      e.preventDefault()
      setDragOverCol(colKey)
    }
  }

  function handleColDragOver(e: React.DragEvent, colKey: string) {
    if (!isValidDrop(colKey)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  function handleColDragLeave(_e: React.DragEvent, colKey: string) {
    dragCounters.current[colKey] = (dragCounters.current[colKey] ?? 1) - 1
    if ((dragCounters.current[colKey] ?? 0) <= 0) {
      dragCounters.current[colKey] = 0
      if (dragOverCol === colKey) setDragOverCol(null)
    }
  }

  async function handleDrop(e: React.DragEvent, colKey: string) {
    e.preventDefault()
    dragCounters.current[colKey] = 0
    setDragOverCol(null)
    if (!dragInfo || !isValidDrop(colKey)) return
    const { id } = dragInfo
    setDragInfo(null)

    if (colKey === 'resolved') {
      setResolveSheet({ id })
      setResCode('')
      setResNotes('')
      setResolveError('')
      return
    }

    setTransitioning(prev => new Set(prev).add(id))
    try {
      await onTransition(id, colKey)
    } finally {
      setTransitioning(prev => { const n = new Set(prev); n.delete(id); return n })
    }
  }

  async function confirmResolve() {
    if (!resolveSheet || !resCode || !resNotes.trim()) return
    setResolving(true)
    setResolveError('')
    try {
      await onTransition(resolveSheet.id, 'resolved', resCode, resNotes)
      setResolveSheet(null)
      setResCode('')
      setResNotes('')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Transition failed'
      setResolveError(String(msg))
    } finally {
      setResolving(false)
    }
  }

  return (
    <>
      <div
        style={{
          display: 'flex',
          gap: 10,
          height: '100%',
          overflowX: 'auto',
          overflowY: 'hidden',
          padding: '10px 14px',
          alignItems: 'flex-start',
        }}
      >
        {KANBAN_COLUMNS.map(col => {
          const cards = byState[col.key] ?? []
          const isDragOver = dragOverCol === col.key
          const canDrop = !!dragInfo && isValidDrop(col.key)

          return (
            <div
              key={col.key}
              onDragEnter={e => handleColDragEnter(e, col.key)}
              onDragOver={e => handleColDragOver(e, col.key)}
              onDragLeave={e => handleColDragLeave(e, col.key)}
              onDrop={e => handleDrop(e, col.key)}
              style={{
                flexShrink: 0,
                width: 230,
                display: 'flex',
                flexDirection: 'column',
                borderRadius: 6,
                border: `1.5px solid ${
                  isDragOver ? col.color + 'aa'
                  : canDrop   ? col.color + '55'
                  :             col.border
                }`,
                background: isDragOver ? col.color + '12' : canDrop ? col.color + '08' : col.bg,
                transition: 'border-color 0.15s, background 0.15s',
                maxHeight: '100%',
                overflow: 'hidden',
              }}
            >
              {/* Column header */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 10px 7px',
                borderBottom: `1px solid ${col.border}`,
                flexShrink: 0,
              }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: col.color, flexShrink: 0 }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: col.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {col.label}
                </span>
                <span style={{
                  marginLeft: 'auto', fontSize: 10, fontWeight: 600,
                  color: col.color,
                  background: col.color + '18',
                  border: `1px solid ${col.color}33`,
                  borderRadius: 10, padding: '0 6px', minWidth: 18, textAlign: 'center',
                }}>
                  {cards.length}
                </span>
              </div>

              {/* Cards */}
              <div style={{ overflowY: 'auto', padding: '6px', display: 'flex', flexDirection: 'column', gap: 5, flex: 1 }}>
                {cards.map(item => {
                  const isMoving = transitioning.has(item.id)
                  const prioColor = PRIORITY_COLORS[item.priority] ?? '#94a3b8'
                  const priority = priorities.find(p => p.level === item.priority)
                  const initials = item.assignee_name
                    ? item.assignee_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
                    : null

                  return (
                    // outer motion.div handles enter/exit animation; inner div owns HTML5 drag events
                    // (framer-motion overloads onDragStart with its own pointer type — kept separate)
                    <motion.div
                      key={item.id}
                      layout
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: isMoving ? 0.35 : 1, y: 0, scale: isMoving ? 0.97 : 1 }}
                      exit={{ opacity: 0, scale: 0.94 }}
                      transition={{ duration: 0.18 }}
                      style={{ pointerEvents: isMoving ? 'none' : 'auto' }}
                    >
                      <div
                        draggable={isAgent && !isMoving}
                        onDragStart={e => handleDragStart(e, item)}
                        onDragEnd={handleDragEnd}
                        onClick={() => navigate(`/incidents/${item.id}`)}
                        style={{
                          background: '#fff',
                          border: '1px solid #e2e8f0',
                          borderLeft: `3px solid ${prioColor}`,
                          borderRadius: 4,
                          padding: '7px 9px',
                          cursor: isAgent ? 'grab' : 'pointer',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                          userSelect: 'none',
                        }}
                      >
                        {/* Number row */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                          <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>
                            {item.number}
                          </span>
                          {item.sla_breached && (
                            <span style={{
                              fontSize: 9, fontWeight: 700, color: '#dc2626',
                              background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)',
                              borderRadius: 2, padding: '0 4px',
                            }}>
                              SLA
                            </span>
                          )}
                        </div>
                        {/* Title */}
                        <p style={{
                          fontSize: 12, fontWeight: 500, color: '#1e293b',
                          margin: '0 0 6px', lineHeight: 1.4,
                          maxHeight: '2.8em', overflow: 'hidden',
                        }}>
                          {item.title}
                        </p>
                        {/* Footer */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{
                            fontSize: 9, fontWeight: 600, textTransform: 'uppercase',
                            color: prioColor,
                            background: prioColor + '18',
                            border: `1px solid ${prioColor}33`,
                            borderRadius: 2, padding: '1px 5px',
                          }}>
                            {priority?.name ?? `P${item.priority}`}
                          </span>
                          {initials && (
                            <div
                              title={item.assignee_name ?? ''}
                              style={{
                                marginLeft: 'auto', width: 18, height: 18, borderRadius: '50%',
                                background: '#e2e8f0', color: '#475569',
                                fontSize: 9, fontWeight: 700,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                flexShrink: 0,
                              }}
                            >
                              {initials}
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )
                })}

                {cards.length === 0 && (
                  <div style={{
                    padding: '20px 8px', textAlign: 'center', fontSize: 11,
                    color: isDragOver ? col.color : '#d1d5db',
                    fontStyle: 'italic', transition: 'color 0.15s',
                    pointerEvents: 'none',
                  }}>
                    {isDragOver ? '↓ Drop here' : 'No incidents'}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Glassmorphic resolve sheet */}
      <AnimatePresence>
        {resolveSheet && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setResolveSheet(null)}
              style={{
                position: 'fixed', inset: 0, zIndex: 1000,
                background: 'rgba(15,23,42,0.48)',
                backdropFilter: 'blur(5px)',
                WebkitBackdropFilter: 'blur(5px)',
              }}
            />
            <motion.div
              key="sheet"
              initial={{ y: '100%', opacity: 0.5 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              transition={{ type: 'spring', damping: 30, stiffness: 280 }}
              style={{
                position: 'fixed', bottom: 0,
                left: '50%', transform: 'translateX(-50%)',
                width: '100%', maxWidth: 500,
                zIndex: 1001,
                background: 'rgba(255,255,255,0.90)',
                backdropFilter: 'blur(24px)',
                WebkitBackdropFilter: 'blur(24px)',
                border: '1px solid rgba(255,255,255,0.55)',
                borderBottom: 'none',
                borderRadius: '14px 14px 0 0',
                boxShadow: '0 -12px 48px rgba(0,0,0,0.18), 0 -2px 8px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.8)',
                padding: '18px 24px 32px',
              }}
            >
              {/* Handle bar */}
              <div style={{
                width: 36, height: 4, borderRadius: 2,
                background: 'rgba(0,0,0,0.14)',
                margin: '0 auto 18px',
              }} />

              <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 3 }}>
                Mark as Resolved
              </div>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 18 }}>
                Both fields are required to close this incident.
              </div>

              {/* Resolution Code */}
              <div style={{ marginBottom: 12 }}>
                <label style={{
                  display: 'block', fontSize: 10, fontWeight: 700, color: '#64748b',
                  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5,
                }}>
                  Resolution Code *
                </label>
                <select
                  value={resCode}
                  onChange={e => setResCode(e.target.value)}
                  style={{
                    width: '100%', padding: '8px 10px', fontSize: 12,
                    border: '1px solid rgba(0,0,0,0.14)', borderRadius: 8,
                    background: 'rgba(255,255,255,0.65)',
                    color: '#0f172a', boxSizing: 'border-box',
                    outline: 'none',
                  }}
                >
                  <option value="">Select a resolution code…</option>
                  {resolutionCodes.map(code => (
                    <option key={code} value={code}>{code}</option>
                  ))}
                </select>
              </div>

              {/* Resolution Notes */}
              <div style={{ marginBottom: 18 }}>
                <label style={{
                  display: 'block', fontSize: 10, fontWeight: 700, color: '#64748b',
                  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5,
                }}>
                  Resolution Notes *
                </label>
                <textarea
                  value={resNotes}
                  onChange={e => setResNotes(e.target.value)}
                  rows={3}
                  placeholder="Describe how the issue was resolved…"
                  style={{
                    width: '100%', padding: '8px 10px', fontSize: 12, resize: 'none',
                    border: '1px solid rgba(0,0,0,0.14)', borderRadius: 8,
                    background: 'rgba(255,255,255,0.65)',
                    color: '#0f172a', lineHeight: 1.5, boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
              </div>

              {resolveError && (
                <p style={{ fontSize: 11, color: '#dc2626', marginBottom: 10 }}>{resolveError}</p>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={confirmResolve}
                  disabled={!resCode || !resNotes.trim() || resolving}
                  style={{
                    flex: 1, height: 40, borderRadius: 8, fontSize: 13, fontWeight: 600,
                    border: 'none',
                    background: resCode && resNotes.trim() && !resolving
                      ? 'linear-gradient(135deg, #1e293b 0%, #334155 100%)'
                      : '#e2e8f0',
                    color: resCode && resNotes.trim() && !resolving ? '#fff' : '#94a3b8',
                    cursor: resCode && resNotes.trim() && !resolving ? 'pointer' : 'default',
                    transition: 'all 0.15s',
                    boxShadow: resCode && resNotes.trim() && !resolving
                      ? '0 2px 8px rgba(15,23,42,0.3)'
                      : 'none',
                  }}
                >
                  {resolving ? 'Resolving…' : 'Mark Resolved'}
                </button>
                <button
                  onClick={() => setResolveSheet(null)}
                  style={{
                    height: 40, padding: '0 18px', borderRadius: 8, fontSize: 13,
                    border: '1px solid rgba(0,0,0,0.12)',
                    background: 'rgba(255,255,255,0.55)',
                    color: '#475569', cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
