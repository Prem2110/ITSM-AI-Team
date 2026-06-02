import { AnimatePresence, motion } from 'framer-motion'
import { X, HelpCircle, ArrowRight, Grip, MousePointer, List, Columns } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
}

const STATE_FLOW = [
  { key: 'new',         label: 'New',         color: '#1d4ed8', bg: '#eff6ff' },
  { key: 'assigned',    label: 'Assigned',     color: '#7c3aed', bg: '#f5f3ff' },
  { key: 'in_progress', label: 'In Progress',  color: '#a16207', bg: '#fefce8' },
  { key: 'on_hold',     label: 'On Hold',      color: '#475569', bg: '#f8fafc' },
  { key: 'resolved',    label: 'Resolved',     color: '#15803d', bg: '#f0fdf4' },
  { key: 'closed',      label: 'Closed',       color: '#334155', bg: '#f1f5f9' },
]

const PRIORITIES = [
  { level: 0, name: 'Critical',  color: '#7f1d1d', bg: '#fef2f2', desc: 'Immediate response — business-critical outage' },
  { level: 1, name: 'High',      color: '#dc2626', bg: '#fff5f5', desc: 'Same-day resolution required' },
  { level: 2, name: 'Medium',    color: '#ea580c', bg: '#fff7ed', desc: 'Next business day' },
  { level: 3, name: 'Low',       color: '#ca8a04', bg: '#fefce8', desc: 'Best effort' },
  { level: 4, name: 'Planning',  color: '#16a34a', bg: '#f0fdf4', desc: 'No SLA — informational' },
]

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
        color: '#94a3b8', marginBottom: 12,
      }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function Tip({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '10px 12px', borderRadius: 6,
      border: '1px solid #f1f5f9', background: '#fafafa',
      marginBottom: 8,
    }}>
      <div style={{
        flexShrink: 0, width: 26, height: 26, borderRadius: 6,
        background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#475569',
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b', marginBottom: 2 }}>{title}</div>
        <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.55 }}>{body}</div>
      </div>
    </div>
  )
}

export function HelpModal({ open, onClose }: Props) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="help-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            style={{
              position: 'fixed', inset: 0, zIndex: 1200,
              background: 'rgba(15,23,42,0.45)',
            }}
          />
          <motion.div
            key="help-panel"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            style={{
              position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 1201,
              width: 420, background: '#fff',
              boxShadow: '-8px 0 40px rgba(0,0,0,0.14)',
              display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '14px 18px', borderBottom: '1px solid #f1f5f9', flexShrink: 0,
            }}>
              <HelpCircle size={15} color="#6366f1" />
              <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', flex: 1 }}>Help & Guide</span>
              <button
                onClick={onClose}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 26, height: 26, borderRadius: 4, border: 'none',
                  background: 'none', color: '#94a3b8', cursor: 'pointer',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#f1f5f9')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                <X size={14} />
              </button>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 18px' }}>

              {/* Status Workflow */}
              <Section title="Status Workflow">
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 12, lineHeight: 1.6 }}>
                  Every ticket moves through a fixed set of states. Only the transitions shown below are allowed — you cannot skip states.
                </div>

                {/* Flow diagram */}
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 14 }}>
                  {STATE_FLOW.map((s, i) => (
                    <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{
                        padding: '4px 10px', borderRadius: 20,
                        fontSize: 11, fontWeight: 600, color: s.color,
                        background: s.bg, border: `1.5px solid ${s.color}33`,
                        whiteSpace: 'nowrap',
                      }}>
                        {s.label}
                      </div>
                      {i < STATE_FLOW.length - 1 && (
                        <ArrowRight size={12} color="#cbd5e1" />
                      )}
                    </div>
                  ))}
                </div>

                <div style={{
                  fontSize: 11, color: '#64748b', lineHeight: 1.6,
                  padding: '8px 10px', background: '#fafafa', borderRadius: 6,
                  border: '1px solid #f1f5f9',
                }}>
                  <strong style={{ color: '#475569' }}>On Hold</strong> is a pause state — you can return to <em>In Progress</em> from it.
                  {' '}<strong style={{ color: '#475569' }}>Resolved</strong> requires a Resolution Code and Resolution Notes before the transition is allowed.
                </div>
              </Section>

              {/* How to change status */}
              <Section title="How to Change Status">
                <Tip
                  icon={<MousePointer size={13} />}
                  title="Click the status badge"
                  body="On any ticket detail page, click the coloured status badge (e.g. 'In Progress') in the header. A popover appears listing every valid next state. Click one to trigger the transition instantly."
                />
                <Tip
                  icon={<ArrowRight size={13} />}
                  title="Inline action buttons"
                  body="Below the status stepper strip on the ticket page, quick-action buttons appear for the most common forward transitions (e.g. 'Start Work', 'Put on Hold', 'Resolve'). One click — no popover needed."
                />
                <Tip
                  icon={<Grip size={13} />}
                  title="Drag on the Board view"
                  body="Switch to Board view (List / Board toggle in the toolbar). Drag a card from one column to another. If the transition is valid the card moves; dropping onto the Resolved column opens a sheet asking for Resolution Code and Notes."
                />
              </Section>

              {/* Status stepper */}
              <Section title="Status Stepper">
                <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.6 }}>
                  The thin strip at the top of every ticket detail page shows a dot-and-label timeline. The currently active state is highlighted in its brand colour; past states appear in grey; future states are faded. The stepper is visual only — use the badge or action buttons to actually move the ticket.
                </div>
              </Section>

              {/* List vs Board */}
              <Section title="List vs Board View">
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <div style={{
                    flex: 1, padding: '10px 12px', borderRadius: 6,
                    border: '1.5px solid #e2e8f0', background: '#fafafa',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <List size={13} color="#475569" />
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>List</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.55 }}>
                      Sortable, filterable table. Best for searching, bulk-assigning, or exporting incidents. Shows all fields at a glance.
                    </div>
                  </div>
                  <div style={{
                    flex: 1, padding: '10px 12px', borderRadius: 6,
                    border: '1.5px solid #e2e8f0', background: '#fafafa',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <Columns size={13} color="#475569" />
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>Board</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.55 }}>
                      Kanban-style columns per state. Best for a real-time workflow view. Agents can drag cards to transition; all users can view.
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>
                  Your preference is saved automatically and remembered on the next visit.
                </div>
              </Section>

              {/* Priority levels */}
              <Section title="Priority Levels">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {PRIORITIES.map(p => (
                    <div key={p.level} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '7px 10px', borderRadius: 5,
                      border: `1px solid ${p.color}22`, background: p.bg,
                    }}>
                      <div style={{
                        flexShrink: 0, padding: '2px 8px', borderRadius: 3,
                        fontSize: 10, fontWeight: 700, color: p.color,
                        border: `1px solid ${p.color}44`,
                        background: 'rgba(255,255,255,0.7)',
                        minWidth: 56, textAlign: 'center',
                      }}>
                        {p.name}
                      </div>
                      <div style={{ fontSize: 11, color: '#475569' }}>{p.desc}</div>
                    </div>
                  ))}
                </div>
              </Section>

              {/* SLA */}
              <Section title="SLA Breach Indicator">
                <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.65 }}>
                  When a ticket's age exceeds the SLA hours defined for its priority (set in <strong style={{ color: '#475569' }}>Settings → General</strong>), a red <strong style={{ color: '#dc2626' }}>SLA</strong> badge appears on the card and in the list.
                  Running the <strong style={{ color: '#475569' }}>Run Escalation</strong> action in the toolbar automatically bumps SLA-breached tickets up one priority level.
                </div>
              </Section>

            </div>

            {/* Footer */}
            <div style={{
              flexShrink: 0, padding: '10px 18px',
              borderTop: '1px solid #f1f5f9',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{ fontSize: 10, color: '#cbd5e1' }}>Sierra Digital ITSM</span>
              <button
                onClick={onClose}
                style={{
                  fontSize: 11, padding: '4px 14px', borderRadius: 4,
                  border: '1px solid #e2e8f0', background: '#f8fafc',
                  color: '#475569', cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
