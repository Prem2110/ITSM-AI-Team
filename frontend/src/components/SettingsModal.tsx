import { useState, useEffect, useRef, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  X, Settings, Palette, Plus, Loader2,
  Monitor, Moon, Sun, Check, Brain, Eye, EyeOff,
} from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useAppSettings } from '@/hooks/useAppSettings'
import { patchAppSettings } from '@/api/setup'
import client from '@/api/client'
import { useAIStatus, usePatchAISettings, useTestConnection } from '@/hooks/useAI'
import { useMe } from '@/hooks/useMe'
import { usePriorities } from '@/hooks'
import { PriorityBadge } from '@/components/PriorityBadge'
import { Skeleton } from '@/components/Skeleton'
import {
  useSettings,
  type Theme,
  type FontSize,
  type FontFamily,
  type Language,
} from '@/contexts/SettingsContext'

export type SettingsTab = 'general' | 'appearance' | 'ai'

// ─── Timezone data ────────────────────────────────────────────────────────────

const FALLBACK_TIMEZONES = [
  'UTC', 'America/New_York', 'America/Chicago', 'America/Denver',
  'America/Los_Angeles', 'Europe/London', 'Europe/Paris', 'Europe/Berlin',
  'Asia/Kolkata', 'Asia/Tokyo', 'Asia/Singapore', 'Australia/Sydney',
]

function getTimezones(): string[] {
  try {
    const tzs = (Intl as any).supportedValuesOf?.('timeZone')
    return Array.isArray(tzs) && tzs.length > 0 ? tzs : FALLBACK_TIMEZONES
  } catch {
    return FALLBACK_TIMEZONES
  }
}

const TIMEZONES = getTimezones()

// ─── Appearance data ──────────────────────────────────────────────────────────

const LANGUAGES: { value: Language; label: string; native: string }[] = [
  { value: 'en', label: 'English',  native: 'English' },
  { value: 'fr', label: 'French',   native: 'Français' },
  { value: 'de', label: 'German',   native: 'Deutsch' },
  { value: 'es', label: 'Spanish',  native: 'Español' },
  { value: 'zh', label: 'Mandarin', native: '中文' },
  { value: 'hi', label: 'Hindi',    native: 'हिन्दी' },
]

const FONT_SIZES: { value: FontSize; label: string; previewPx: number }[] = [
  { value: 'compact',     label: 'Compact',     previewPx: 11 },
  { value: 'default',     label: 'Default',     previewPx: 13 },
  { value: 'comfortable', label: 'Comfortable', previewPx: 14 },
  { value: 'large',       label: 'Large',       previewPx: 16 },
]

const FONTS: { value: FontFamily; label: string; stack: string; tagline: string }[] = [
  { value: 'system',      label: 'System',        stack: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', tagline: 'Native OS font' },
  { value: 'google-sans', label: 'Google Sans',   stack: '"Google Sans", sans-serif',   tagline: 'Clean · friendly' },
  { value: 'ibm-plex',    label: 'IBM Plex Sans', stack: '"IBM Plex Sans", sans-serif', tagline: 'Technical · enterprise' },
  { value: 'dm-sans',     label: 'DM Sans',       stack: '"DM Sans", sans-serif',       tagline: 'Modern · geometric' },
]

// ─── Shared sub-components ────────────────────────────────────────────────────

function SaveButton({
  section, saving, saved, disabled, onClick,
}: {
  section: string; saving: string | null; saved: string | null
  disabled: boolean; onClick: () => void
}) {
  const isSaving = saving === section
  const isSaved  = saved  === section
  return (
    <button
      onClick={onClick}
      disabled={disabled || isSaving}
      className="flex items-center gap-1.5 border border-surface-200 text-xs px-3 py-1.5 text-surface-700 hover:bg-surface-50 disabled:opacity-40 transition-colors"
      style={{ borderRadius: 2 }}
    >
      {isSaving && <Loader2 size={11} className="animate-spin flex-none" />}
      {isSaving ? 'Saving…' : isSaved ? 'Saved ✓' : 'Save'}
    </button>
  )
}

function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <div className="text-2xs font-semibold text-surface-400 uppercase tracking-widest pb-2 mb-5 border-b border-surface-200">
      {children}
    </div>
  )
}

function SubHeader({ children }: { children: ReactNode }) {
  return (
    <div className="text-xs font-semibold text-surface-500 mb-3 uppercase tracking-wider" style={{ fontSize: 11 }}>
      {children}
    </div>
  )
}

// ─── Theme preview mini mockup ────────────────────────────────────────────────

function ThemePreview({ dark }: { dark: boolean }) {
  const bg      = dark ? '#0f172a' : '#f1f5f9'
  const panel   = dark ? '#1e293b' : '#ffffff'
  const sidebar = dark ? '#0a1120' : '#f8fafc'
  const border  = dark ? '#334155' : '#e2e8f0'
  const bar     = dark ? '#334155' : '#e2e8f0'
  const row1    = dark ? '#94a3b8' : '#475569'
  const row2    = dark ? '#475569' : '#94a3b8'
  return (
    <div style={{ width: '100%', height: 56, background: bg, borderRadius: 2, overflow: 'hidden', display: 'flex', border: `1px solid ${border}` }}>
      <div style={{ width: 26, background: sidebar, borderRight: `1px solid ${border}`, padding: '5px 4px', display: 'flex', flexDirection: 'column', gap: 3 }}>
        {[0.8, 0.6, 0.6].map((w, i) => (
          <div key={i} style={{ height: 3, borderRadius: 1, background: i === 0 ? bar : row2, opacity: 0.7, width: `${w * 100}%` }} />
        ))}
      </div>
      <div style={{ flex: 1, background: panel, padding: '5px 6px', display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ height: 4, width: '55%', borderRadius: 1, background: bar }} />
        {[1, 0.8, 0.7].map((w, i) => (
          <div key={i} style={{ height: 3, borderRadius: 1, background: i === 0 ? row1 : row2, opacity: 0.5, width: `${w * 100}%` }} />
        ))}
      </div>
    </div>
  )
}

// ─── General Tab ──────────────────────────────────────────────────────────────

function GeneralTab() {
  const qc = useQueryClient()
  const { data: me } = useMe()
  const { data: settings, isLoading } = useAppSettings()
  const { data: priorities = [] } = usePriorities()
  const isAdmin = me?.scopes?.includes('Admin') ?? false

  const [companyName, setCompanyName]   = useState('')
  const [timezone, setTimezone]         = useState('UTC')
  const [slaTargets, setSlaTargets]     = useState<Record<string, number>>({ '0': 1, '1': 4, '2': 8, '3': 24, '4': 72 })
  const [categories, setCategories]     = useState<string[]>([])
  const [newCategory, setNewCategory]   = useState('')
  const [sources, setSources]           = useState<string[]>([])
  const [newSource, setNewSource]       = useState('')
  const [codes, setCodes]               = useState<string[]>([])
  const [newCode, setNewCode]           = useState('')
  const [saving, setSaving]             = useState<string | null>(null)
  const [saved, setSaved]               = useState<string | null>(null)

  useEffect(() => {
    if (settings) {
      setCompanyName(settings.company_name)
      setTimezone(settings.timezone)
      setSlaTargets(settings.sla_targets ?? { '0': 1, '1': 4, '2': 8, '3': 24, '4': 72 })
      setCategories(settings.categories ?? [])
      setSources(settings.sources ?? [])
      setCodes(settings.resolution_codes ?? [])
    }
  }, [settings])

  async function saveSection(section: string, fields: object) {
    setSaving(section); setSaved(null)
    try {
      await patchAppSettings(fields)
      qc.invalidateQueries({ queryKey: ['app-settings'] })
      qc.invalidateQueries({ queryKey: ['setup-status'] })
      qc.invalidateQueries({ queryKey: ['config'] })
      setSaved(section)
      setTimeout(() => setSaved(null), 2000)
    } finally {
      setSaving(null)
    }
  }

  function addCode() {
    const c = newCode.trim()
    if (c && !codes.includes(c)) setCodes(prev => [...prev, c])
    setNewCode('')
  }

  function addCategory() {
    const c = newCategory.trim()
    if (c && !categories.includes(c)) setCategories(prev => [...prev, c])
    setNewCategory('')
  }

  function addSource() {
    const c = newSource.trim()
    if (c && !sources.includes(c)) setSources(prev => [...prev, c])
    setNewSource('')
  }

  const inputCls = 'w-full border border-surface-200 bg-white text-xs px-2 py-1.5 focus:outline-none focus:border-surface-400'
  const disabledCls = 'w-full border border-surface-100 bg-surface-50 text-xs px-2 py-1.5 text-surface-500 cursor-not-allowed'

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 py-1">
        <div className="flex flex-col gap-3">
          <Skeleton height={10} width="40%" />
          <Skeleton height={30} />
          <Skeleton height={30} />
          <Skeleton height={28} width={80} />
        </div>
        <div className="flex flex-col gap-3">
          <Skeleton height={10} width="35%" />
          <Skeleton height={28} width={80} />
        </div>
      </div>
    )
  }

  return (
    <>
      {!isAdmin && (
        <div className="mb-5 border border-surface-200 bg-white px-4 py-3 text-xs text-surface-500" style={{ borderRadius: 2 }}>
          You have read-only access. Contact an administrator to make changes.
        </div>
      )}

      <section className="mb-8">
        <SectionHeader>Company</SectionHeader>
        <div className="mb-3">
          <label className="block text-xs font-medium text-surface-600 mb-1">Company name</label>
          <input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)}
            disabled={!isAdmin} placeholder="Acme Corporation"
            className={isAdmin ? inputCls : disabledCls} style={{ borderRadius: 2 }} />
        </div>
        <div className="mb-4">
          <label className="block text-xs font-medium text-surface-600 mb-1">Timezone</label>
          {isAdmin ? (
            <select value={timezone} onChange={e => setTimezone(e.target.value)} className={inputCls} style={{ borderRadius: 2 }}>
              {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          ) : (
            <input type="text" value={timezone} disabled className={disabledCls} style={{ borderRadius: 2 }} />
          )}
        </div>
        {isAdmin && (
          <SaveButton section="company" saving={saving} saved={saved} disabled={!companyName.trim()}
            onClick={() => saveSection('company', { company_name: companyName, timezone })} />
        )}
      </section>

      <section className="mb-8">
        <SectionHeader>SLA Targets</SectionHeader>
        <p className="text-xs text-surface-400 mb-4">Resolution time targets per priority level (hours).</p>
        <table className="w-full text-xs mb-4">
          <thead>
            <tr className="border-b border-surface-200">
              <th className="text-left pb-2 text-surface-500 font-medium">Priority</th>
              <th className="text-right pb-2 text-surface-500 font-medium">Hours</th>
            </tr>
          </thead>
          <tbody>
            {[0, 1, 2, 3, 4].map(level => (
              <tr key={level} className="border-b border-surface-100">
                <td className="py-2"><PriorityBadge priority={level} priorities={priorities} /></td>
                <td className="py-2 flex justify-end">
                  <input type="number" min={1} value={slaTargets[String(level)] ?? ''}
                    onChange={e => setSlaTargets(prev => ({ ...prev, [String(level)]: Number(e.target.value) }))}
                    disabled={!isAdmin}
                    className="border border-surface-200 bg-white text-xs px-2 py-1 focus:outline-none focus:border-surface-400 text-right disabled:bg-surface-50 disabled:text-surface-500 disabled:cursor-not-allowed"
                    style={{ borderRadius: 2, width: 72 }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {isAdmin && (
          <SaveButton section="sla" saving={saving} saved={saved}
            disabled={Object.values(slaTargets).some(v => !v || v < 1)}
            onClick={() => saveSection('sla', { sla_targets: slaTargets })} />
        )}
      </section>

      <section className="mb-8">
        <SectionHeader>Incident Categories</SectionHeader>
        <p className="text-xs text-surface-400 mb-4">Categories used to classify incidents. Removing a category won't affect existing tickets.</p>
        <div className="flex flex-col gap-1 mb-3">
          {categories.map((cat, idx) => (
            <div key={idx} className="flex items-center justify-between border border-surface-200 bg-white px-2 py-1" style={{ borderRadius: 2 }}>
              <span className="text-xs text-surface-700">{cat}</span>
              {isAdmin && (
                <button onClick={() => setCategories(prev => prev.filter((_, i) => i !== idx))}
                  className="text-surface-400 hover:text-surface-700 transition-colors ml-2 flex-none">
                  <X size={12} />
                </button>
              )}
            </div>
          ))}
          {categories.length === 0 && <div className="text-xs text-surface-400 py-1">No categories defined.</div>}
        </div>
        {isAdmin && (
          <>
            <div className="flex gap-1 mb-4">
              <input type="text" value={newCategory} onChange={e => setNewCategory(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addCategory()} placeholder="Add a category…"
                className="flex-1 border border-surface-200 bg-white text-xs px-2 py-1.5 focus:outline-none focus:border-surface-400"
                style={{ borderRadius: 2 }} />
              <button onClick={addCategory} disabled={!newCategory.trim()}
                className="border border-surface-200 px-2 py-1 text-xs text-surface-600 hover:bg-surface-50 disabled:opacity-40 transition-colors flex items-center"
                style={{ borderRadius: 2 }}>
                <Plus size={12} />
              </button>
            </div>
            <SaveButton section="categories" saving={saving} saved={saved}
              disabled={categories.length === 0}
              onClick={() => saveSection('categories', { categories })} />
          </>
        )}
      </section>

      <section className="mb-8">
        <SectionHeader>Incident Sources</SectionHeader>
        <p className="text-xs text-surface-400 mb-4">Channels through which incidents are reported. Shown in the new incident form.</p>
        <div className="flex flex-col gap-1 mb-3">
          {sources.map((src, idx) => (
            <div key={idx} className="flex items-center justify-between border border-surface-200 bg-white px-2 py-1" style={{ borderRadius: 2 }}>
              <span className="text-xs text-surface-700">{src}</span>
              {isAdmin && (
                <button onClick={() => setSources(prev => prev.filter((_, i) => i !== idx))}
                  className="text-surface-400 hover:text-surface-700 transition-colors ml-2 flex-none">
                  <X size={12} />
                </button>
              )}
            </div>
          ))}
          {sources.length === 0 && <div className="text-xs text-surface-400 py-1">No sources defined.</div>}
        </div>
        {isAdmin && (
          <>
            <div className="flex gap-1 mb-4">
              <input type="text" value={newSource} onChange={e => setNewSource(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addSource()} placeholder="Add a source channel…"
                className="flex-1 border border-surface-200 bg-white text-xs px-2 py-1.5 focus:outline-none focus:border-surface-400"
                style={{ borderRadius: 2 }} />
              <button onClick={addSource} disabled={!newSource.trim()}
                className="border border-surface-200 px-2 py-1 text-xs text-surface-600 hover:bg-surface-50 disabled:opacity-40 transition-colors flex items-center"
                style={{ borderRadius: 2 }}>
                <Plus size={12} />
              </button>
            </div>
            <SaveButton section="sources" saving={saving} saved={saved}
              disabled={sources.length === 0}
              onClick={() => saveSection('sources', { sources })} />
          </>
        )}
      </section>

      <section className="mb-4">
        <SectionHeader>Resolution Codes</SectionHeader>
        <p className="text-xs text-surface-400 mb-4">Codes agents select when resolving an incident.</p>
        <div className="flex flex-col gap-1 mb-3">
          {codes.map((code, idx) => (
            <div key={idx} className="flex items-center justify-between border border-surface-200 bg-white px-2 py-1" style={{ borderRadius: 2 }}>
              <span className="text-xs text-surface-700">{code}</span>
              {isAdmin && (
                <button onClick={() => setCodes(prev => prev.filter((_, i) => i !== idx))}
                  className="text-surface-400 hover:text-surface-700 transition-colors ml-2 flex-none">
                  <X size={12} />
                </button>
              )}
            </div>
          ))}
          {codes.length === 0 && <div className="text-xs text-surface-400 py-1">No resolution codes defined.</div>}
        </div>
        {isAdmin && (
          <>
            <div className="flex gap-1 mb-4">
              <input type="text" value={newCode} onChange={e => setNewCode(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addCode()} placeholder="Add a code…"
                className="flex-1 border border-surface-200 bg-white text-xs px-2 py-1.5 focus:outline-none focus:border-surface-400"
                style={{ borderRadius: 2 }} />
              <button onClick={addCode} disabled={!newCode.trim()}
                className="border border-surface-200 px-2 py-1 text-xs text-surface-600 hover:bg-surface-50 disabled:opacity-40 transition-colors flex items-center"
                style={{ borderRadius: 2 }}>
                <Plus size={12} />
              </button>
            </div>
            <SaveButton section="codes" saving={saving} saved={saved}
              disabled={codes.length === 0}
              onClick={() => saveSection('codes', { resolution_codes: codes })} />
          </>
        )}
      </section>

      {isAdmin && <DangerZone />}

    </>
  )
}

// ─── Danger Zone ─────────────────────────────────────────────────────────────

type ResetTarget = 'data' | 'factory' | null

function DangerZone() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [target, setTarget]   = useState<ResetTarget>(null)
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy]       = useState(false)
  const [result, setResult]   = useState<string | null>(null)
  const [err, setErr]         = useState<string | null>(null)

  const DATA_PHRASE    = 'RESET'
  const FACTORY_PHRASE = 'FACTORY RESET'

  function openModal(t: ResetTarget) {
    setTarget(t); setConfirm(''); setResult(null); setErr(null)
  }
  function closeModal() {
    setTarget(null); setConfirm(''); setResult(null); setErr(null)
  }

  const phrase     = target === 'factory' ? FACTORY_PHRASE : DATA_PHRASE
  const confirmed  = confirm === phrase
  const endpoint   = target === 'factory' ? '/admin/factory-reset' : '/admin/reset-data'

  async function execute() {
    setBusy(true); setErr(null); setResult(null)
    try {
      const { data } = await client.post(endpoint)
      const d = data.deleted
      if (target === 'factory') {
        setResult(`Deleted ${d.incidents} incidents, ${d.users} users, ${d.settings} settings row.`)
        qc.clear()
        setTimeout(() => { navigate('/setup', { replace: true }) }, 1800)
      } else {
        setResult(`Deleted ${d.incidents} incidents, ${d.events} events, ${d.attachments} attachments.`)
        qc.invalidateQueries()
      }
    } catch (e: any) {
      setErr(e?.response?.data?.detail ?? 'An error occurred.')
    } finally {
      setBusy(false)
    }
  }

  const ACTIONS = [
    {
      key: 'data' as const,
      title: 'Reset Data',
      description: 'Deletes all incidents, events and attachments. Users and settings are kept.',
      phrase: DATA_PHRASE,
      buttonLabel: 'Reset Data',
      confirmLabel: 'Yes, delete all data',
      color: '#b45309',
      bg: 'rgba(180,83,9,0.07)',
      border: 'rgba(180,83,9,0.25)',
    },
    {
      key: 'factory' as const,
      title: 'Factory Reset',
      description: 'Deletes everything — incidents, users, and settings. Returns the app to the setup wizard.',
      phrase: FACTORY_PHRASE,
      buttonLabel: 'Factory Reset',
      confirmLabel: 'Yes, wipe everything',
      color: '#b91c1c',
      bg: 'rgba(185,28,28,0.07)',
      border: 'rgba(185,28,28,0.25)',
    },
  ]

  const activeAction = ACTIONS.find(a => a.key === target)

  return (
    <>
      {/* Divider */}
      <div className="border-t border-red-200 mt-6 mb-6" />

      {/* Header */}
      <div className="mb-4 flex items-center gap-2">
        <div className="flex-1 h-px bg-red-200" />
        <span className="text-2xs font-bold text-red-500 uppercase tracking-widest px-2">Danger Zone</span>
        <div className="flex-1 h-px bg-red-200" />
      </div>

      <div className="flex flex-col gap-3">
        {ACTIONS.map(action => (
          <div
            key={action.key}
            className="flex items-center justify-between px-4 py-3"
            style={{ background: action.bg, border: `1px solid ${action.border}`, borderRadius: 3 }}
          >
            <div>
              <div className="text-xs font-semibold mb-0.5" style={{ color: action.color }}>{action.title}</div>
              <div className="text-2xs text-surface-500">{action.description}</div>
            </div>
            <button
              onClick={() => openModal(action.key)}
              className="flex-none text-2xs font-semibold px-3 py-1.5 border transition-colors ml-4"
              style={{
                color: action.color, borderColor: action.border,
                background: 'white', borderRadius: 2,
              }}
            >
              {action.buttonLabel}
            </button>
          </div>
        ))}
      </div>

      {/* Action sheet slide-up — iOS action sheet */}
      <AnimatePresence>
        {target && activeAction && (
        <motion.div
          onClick={closeModal}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{
            position: 'fixed', inset: 0, zIndex: 2000,
            background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(3px)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            padding: '0 24px 32px',
          }}
        >
          <motion.div
            onClick={e => e.stopPropagation()}
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '80%', opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            style={{
              background: 'var(--bg-primary)', border: `1px solid ${activeAction.border}`,
              borderRadius: 12, width: '100%', maxWidth: 420, padding: 24,
              boxShadow: '0 24px 64px rgba(0,0,0,0.22)',
            }}
          >
            <div className="text-sm font-semibold mb-1" style={{ color: activeAction.color }}>
              {activeAction.title}
            </div>
            <p className="text-xs text-surface-500 mb-4" style={{ lineHeight: 1.6 }}>
              {activeAction.description}
              {' '}This action <strong>cannot be undone</strong>.
            </p>

            {!result && (
              <>
                <label className="block text-xs font-medium text-surface-600 mb-1">
                  Type <span className="font-bold" style={{ color: activeAction.color }}>{activeAction.phrase}</span> to confirm
                </label>
                <input
                  type="text"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder={activeAction.phrase}
                  autoFocus
                  className="w-full border border-surface-200 bg-white text-xs px-2 py-1.5 focus:outline-none mb-4"
                  style={{ borderRadius: 2, borderColor: confirmed ? activeAction.border : undefined }}
                />
                {err && (
                  <div className="text-2xs text-red-600 border border-red-200 bg-red-50 px-3 py-2 mb-3" style={{ borderRadius: 2 }}>
                    {err}
                  </div>
                )}
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={closeModal}
                    className="text-xs border border-surface-200 text-surface-600 hover:bg-surface-50 px-3 py-1.5 transition-colors"
                    style={{ borderRadius: 2 }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={execute}
                    disabled={!confirmed || busy}
                    className="text-xs font-semibold text-white disabled:opacity-40 px-3 py-1.5 transition-colors flex items-center gap-1.5"
                    style={{ background: confirmed ? activeAction.color : '#94a3b8', borderRadius: 2, border: 'none' }}
                  >
                    {busy && <Loader2 size={11} className="animate-spin" />}
                    {busy ? 'Working…' : activeAction.confirmLabel}
                  </button>
                </div>
              </>
            )}

            {result && (
              <div className="text-xs text-surface-600">
                <div className="flex items-center gap-2 text-green-700 font-semibold mb-2">
                  <Check size={14} /> Done
                </div>
                <div className="text-surface-500">{result}</div>
                {target === 'factory' && (
                  <div className="text-2xs text-surface-400 mt-2">Redirecting to setup wizard…</div>
                )}
              </div>
            )}
          </motion.div>
        </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

// ─── AI & Automation Tab ──────────────────────────────────────────────────────

// Only free-tier OpenRouter models are listed here.
// Any other model ID can be pasted directly into the input below.
const OPENROUTER_MODELS = [
  { id: 'meta-llama/llama-3.3-70b-instruct:free',         label: 'Llama 3.3 70B'       },
  { id: 'meta-llama/llama-3.1-8b-instruct:free',          label: 'Llama 3.1 8B'        },
  { id: 'meta-llama/llama-3.2-3b-instruct:free',          label: 'Llama 3.2 3B'        },
  { id: 'mistralai/mistral-7b-instruct:free',              label: 'Mistral 7B'          },
  { id: 'google/gemma-3-12b-it:free',                      label: 'Gemma 3 12B'         },
  { id: 'google/gemma-2-9b-it:free',                       label: 'Gemma 2 9B'          },
  { id: 'qwen/qwen-2.5-7b-instruct:free',                  label: 'Qwen 2.5 7B'         },
  { id: 'deepseek/deepseek-r1-distill-llama-70b:free',     label: 'DeepSeek R1 70B'     },
  { id: 'microsoft/phi-3-mini-128k-instruct:free',         label: 'Phi-3 Mini 128K'     },
  { id: 'openchat/openchat-7b:free',                       label: 'OpenChat 7B'         },
]

// ─── Model Picker combobox ────────────────────────────────────────────────────

function ModelPicker({ value, onChange, disabled }: {
  value: string
  onChange: (v: string) => void
  disabled: boolean
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputCls = 'w-full border border-surface-200 bg-white text-xs px-2 py-1.5 focus:outline-none focus:border-surface-400'
  const disabledCls = 'w-full border border-surface-100 bg-surface-50 text-xs px-2 py-1.5 text-surface-500 cursor-not-allowed'

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const query = value.trim().toLowerCase()
  const filtered = query
    ? OPENROUTER_MODELS.filter(m =>
        m.id.toLowerCase().includes(query) || m.label.toLowerCase().includes(query)
      )
    : OPENROUTER_MODELS

  // True when the typed value doesn't exactly match any known model
  const isCustom = value.trim() !== '' && !OPENROUTER_MODELS.some(m => m.id === value.trim())

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={e => { onChange(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          disabled={disabled}
          placeholder="Pick a free model or paste any OpenRouter ID…"
          className={disabled ? disabledCls : inputCls}
          style={{ borderRadius: 2, paddingRight: isCustom ? 72 : undefined }}
        />
        {isCustom && !disabled && (
          <span
            className="absolute right-2 top-1/2 -translate-y-1/2 text-2xs font-semibold text-violet-600 bg-violet-50 border border-violet-200 px-1.5 py-0.5 pointer-events-none"
            style={{ borderRadius: 3 }}
          >
            CUSTOM
          </span>
        )}
      </div>

      {open && !disabled && (
        <div
          className="absolute z-50 left-0 right-0 bg-white border border-surface-200 shadow-lg overflow-y-auto"
          style={{ top: '100%', marginTop: 2, borderRadius: 3, maxHeight: 232 }}
        >
          {/* Free models list */}
          {filtered.length > 0 && (
            <>
              <div className="px-3 pt-2 pb-1 text-2xs font-semibold text-surface-400 uppercase tracking-widest">
                Free models
              </div>
              {filtered.map(m => (
                <button
                  key={m.id}
                  type="button"
                  onMouseDown={e => { e.preventDefault(); onChange(m.id); setOpen(false) }}
                  className={`flex items-center justify-between w-full text-left px-3 py-1.5 text-xs transition-colors hover:bg-violet-50 ${value === m.id ? 'bg-violet-50 text-violet-700' : 'text-surface-700'}`}
                >
                  <span className="truncate mr-2">{m.id}</span>
                  <span
                    className="text-2xs font-semibold text-green-600 bg-green-50 border border-green-200 px-1.5 py-0.5 flex-none"
                    style={{ borderRadius: 3 }}
                  >
                    FREE
                  </span>
                </button>
              ))}
            </>
          )}

          {filtered.length === 0 && (
            <div className="px-3 py-2 text-xs text-surface-400 italic">
              No free models match — your custom ID will be used as-is
            </div>
          )}

          {/* Custom paste hint */}
          <div className="border-t border-surface-100 px-3 py-2 mt-1">
            <p className="text-2xs text-surface-400 leading-relaxed">
              Need a different model?{' '}
              <span className="font-medium text-surface-600">openrouter.ai/models</span>
              {' '}→ copy the model ID → paste it above.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

function AITab() {
  const { data: me } = useMe()
  const isAdmin = me?.scopes?.includes('Admin') ?? false
  const { data: aiStatus } = useAIStatus()
  const patchAI = usePatchAISettings()
  const testConn = useTestConnection()

  const [apiKey, setApiKey]   = useState('')
  const [model, setModel]     = useState('meta-llama/llama-3.1-8b-instruct:free')
  const [showKey, setShowKey] = useState(false)
  const [saved, setSaved]     = useState(false)

  const inputCls   = 'w-full border border-surface-200 bg-white text-xs px-2 py-1.5 focus:outline-none focus:border-surface-400'
  const disabledCls = 'w-full border border-surface-100 bg-surface-50 text-xs px-2 py-1.5 text-surface-500 cursor-not-allowed'

  useEffect(() => {
    if (aiStatus) {
      setModel(aiStatus.model || 'meta-llama/llama-3.1-8b-instruct:free')
      if (aiStatus.has_key) setApiKey('••••••••••••••••')
    }
  }, [aiStatus])

  async function saveAI() {
    const fields: Record<string, string | number> = { openrouter_model: model }
    if (apiKey && !apiKey.startsWith('•')) fields.openrouter_api_key = apiKey
    await patchAI.mutateAsync(fields)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const aiEnabled = Boolean(aiStatus?.ai_enabled)

  return (
    <>
      {/* Master toggle */}
      <section className="mb-8">
        <SectionHeader>AI &amp; Automation</SectionHeader>
        <p className="text-xs text-surface-400 mb-4">
          Powers auto-classify, similar incidents, and agent suggestions via{' '}
          <span className="font-medium text-surface-600">OpenRouter</span>.
        </p>

        <div
          className="flex items-center justify-between px-4 py-3 border border-surface-200 bg-white mb-2"
          style={{ borderRadius: 3 }}
        >
          <div>
            <div className="flex items-center gap-2">
              <Brain size={13} className="text-violet-500" />
              <span className="text-xs font-semibold text-surface-700">Enable AI features</span>
            </div>
            <p className="text-2xs text-surface-400 mt-0.5 ml-5">
              {aiEnabled ? 'AI features are active across the app' : 'AI features are disabled'}
            </p>
          </div>
          <button
            disabled={!isAdmin || patchAI.isPending}
            onClick={() => patchAI.mutate({ ai_enabled: aiEnabled ? 0 : 1 })}
            className={`relative inline-flex items-center transition-colors disabled:opacity-50 flex-none ${aiEnabled ? 'bg-violet-600' : 'bg-surface-300'}`}
            style={{ width: 40, height: 22, borderRadius: 11 }}
          >
            <span
              className="absolute bg-white transition-transform"
              style={{
                width: 16, height: 16, borderRadius: '50%', left: 3,
                transform: aiEnabled ? 'translateX(18px)' : 'translateX(0)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
              }}
            />
          </button>
        </div>
      </section>

      {/* API credentials */}
      <section className="mb-8">
        <SectionHeader>OpenRouter Credentials</SectionHeader>

        <div className="mb-4">
          <label className="block text-xs font-medium text-surface-600 mb-1">API Key</label>
          <div className="flex gap-1">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              onFocus={() => { if (apiKey.startsWith('•')) setApiKey('') }}
              disabled={!isAdmin}
              placeholder="sk-or-…"
              className={`flex-1 ${isAdmin ? inputCls : disabledCls}`}
              style={{ borderRadius: 2 }}
            />
            <button
              type="button"
              onClick={() => setShowKey(s => !s)}
              className="border border-surface-200 px-2.5 flex items-center text-surface-400 hover:text-surface-600 bg-white transition-colors flex-none"
              style={{ borderRadius: 2, height: 30 }}
              title={showKey ? 'Hide key' : 'Show key'}
            >
              {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          </div>
          <p className="text-2xs text-surface-400 mt-1">
            Get a key at <span className="font-medium text-surface-600">openrouter.ai/keys</span>
          </p>
        </div>

        <div className="mb-5">
          <label className="block text-xs font-medium text-surface-600 mb-1">Model</label>
          <ModelPicker value={model} onChange={setModel} disabled={!isAdmin} />
          <p className="text-2xs text-surface-400 mt-1">
            Free models are listed above. For any other model, copy its ID from{' '}
            <span className="font-medium text-surface-600">openrouter.ai/models</span>{' '}
            and paste it directly into the field.
          </p>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-2">
            <button
              onClick={saveAI}
              disabled={patchAI.isPending}
              className="inline-flex items-center gap-1.5 border border-surface-300 bg-white text-surface-700 text-xs font-medium hover:bg-surface-50 disabled:opacity-50 transition-colors px-3"
              style={{ height: 28, borderRadius: 2 }}
            >
              {patchAI.isPending
                ? <Loader2 size={11} className="animate-spin" />
                : saved ? <Check size={11} className="text-green-600" /> : null}
              {saved ? 'Saved' : 'Save Settings'}
            </button>
          </div>
        )}
      </section>

      {/* Test connection */}
      <section className="mb-4">
        <SectionHeader>Test Connection</SectionHeader>
        <p className="text-xs text-surface-400 mb-4">
          Verify the API key and model are working by sending a test request to OpenRouter.
        </p>

        <button
          type="button"
          onClick={() => testConn.mutate()}
          disabled={testConn.isPending || !aiStatus?.has_key}
          className="inline-flex items-center gap-2 border border-surface-300 bg-white text-surface-700 text-xs font-medium hover:bg-surface-50 disabled:opacity-50 transition-colors px-3 mb-4"
          style={{ height: 30, borderRadius: 2 }}
        >
          {testConn.isPending
            ? <><Loader2 size={11} className="animate-spin" /> Testing…</>
            : <><Brain size={11} className="text-violet-500" /> Test Connection</>}
        </button>

        {testConn.data && (
          <div
            className={`px-4 py-3 border text-xs ${testConn.data.ok
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-800'}`}
            style={{ borderRadius: 3 }}
          >
            <div className="flex items-center gap-2 font-semibold mb-1">
              {testConn.data.ok ? <Check size={12} /> : <X size={12} />}
              {testConn.data.ok ? 'Connected successfully' : 'Connection failed'}
            </div>
            <div className="text-2xs space-y-0.5 opacity-80">
              <div>Model: <span className="font-medium">{testConn.data.model}</span></div>
              <div>Latency: <span className="font-medium">{testConn.data.latency_ms}ms</span></div>
              {testConn.data.error && <div>Error: {testConn.data.error}</div>}
              {testConn.data.response && <div>Response: {testConn.data.response}</div>}
            </div>
          </div>
        )}

        {!aiStatus?.has_key && (
          <p className="text-2xs text-surface-400">Save an API key first to enable testing.</p>
        )}
      </section>
    </>
  )
}

// ─── Appearance Tab ───────────────────────────────────────────────────────────

function AppearanceTab() {
  const { t } = useTranslation()
  const { theme, fontSize, fontFamily, language, setTheme, setFontSize, setFontFamily, setLanguage } = useSettings()

  const THEMES: { value: Theme; label: string; Icon: typeof Sun; description: string }[] = [
    { value: 'light',  label: t('settings.light'),  Icon: Sun,     description: t('settings.alwaysLight') },
    { value: 'dark',   label: t('settings.dark'),   Icon: Moon,    description: t('settings.alwaysDark')  },
    { value: 'system', label: t('settings.system'), Icon: Monitor, description: t('settings.followOs')    },
  ]

  return (
    <>
      <section className="mb-8">
        <SectionHeader>{t('settings.appearance')}</SectionHeader>

        <div className="mb-6">
          <SubHeader>{t('settings.theme')}</SubHeader>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {THEMES.map(({ value, label, Icon, description }) => {
              const active = theme === value
              const previewDark = value === 'dark' || (value === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
              return (
                <button key={value} onClick={() => setTheme(value)}
                  style={{
                    padding: 10, borderRadius: 3, cursor: 'pointer', textAlign: 'left', position: 'relative',
                    border: active ? '2px solid var(--text-primary)' : '1px solid var(--border-color)',
                    background: active ? 'var(--surface-active)' : 'var(--bg-primary)',
                  }}>
                  {active && (
                    <span style={{ position: 'absolute', top: 6, right: 6, width: 16, height: 16, borderRadius: '50%', background: 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Check size={10} style={{ color: 'var(--bg-primary)' }} />
                    </span>
                  )}
                  <ThemePreview dark={previewDark} />
                  <div className="flex items-center gap-1.5 mt-2">
                    <Icon size={12} className="text-surface-500 flex-none" />
                    <span className="text-xs font-semibold text-surface-700">{label}</span>
                  </div>
                  <div style={{ fontSize: 11 }} className="text-surface-400 mt-0.5">{description}</div>
                </button>
              )
            })}
          </div>
        </div>

        <div className="mb-6">
          <SubHeader>{t('settings.interfaceScale')}</SubHeader>
          <div className="flex border border-surface-200 bg-white" style={{ borderRadius: 3, overflow: 'hidden' }}>
            {FONT_SIZES.map((f, idx) => {
              const active = fontSize === f.value
              return (
                <button key={f.value} onClick={() => setFontSize(f.value)}
                  className="flex-1 flex flex-col items-center justify-center transition-colors"
                  style={{
                    padding: '10px 6px', cursor: 'pointer',
                    background: active ? 'var(--text-primary)' : 'var(--bg-primary)',
                    borderRight: idx < FONT_SIZES.length - 1 ? '1px solid var(--border-color)' : undefined,
                  }}>
                  <span style={{ fontSize: f.previewPx, fontWeight: 600, lineHeight: 1, marginBottom: 4, color: active ? 'var(--bg-primary)' : 'var(--text-primary)' }}>Aa</span>
                  <span style={{ fontSize: 10, fontWeight: active ? 600 : 400, color: active ? 'var(--bg-secondary)' : 'var(--text-subtle)', opacity: active ? 0.8 : 1 }}>{f.label}</span>
                </button>
              )
            })}
          </div>
          <p className="text-2xs text-surface-400 mt-1.5">{t('settings.scaleHint')}</p>
        </div>

        <div className="mb-6">
          <SubHeader>{t('settings.typeface')}</SubHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {FONTS.map(({ value, label, stack, tagline }) => {
              const active = fontFamily === value
              return (
                <button key={value} onClick={() => setFontFamily(value)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '10px 14px', borderRadius: 3, cursor: 'pointer', textAlign: 'left',
                    border: active ? '2px solid var(--text-primary)' : '1px solid var(--border-color)',
                    background: active ? 'var(--surface-active)' : 'var(--bg-primary)',
                  }}>
                  <div style={{ flex: 'none', width: 100 }}>
                    <span style={{ fontFamily: stack, fontSize: 17, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--text-primary)', display: 'block', lineHeight: 1.2 }}>
                      Aa Bb 012
                    </span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: stack, fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-subtle)' }}>{tagline}</div>
                  </div>
                  <div style={{ width: 18, height: 18, borderRadius: '50%', flexShrink: 0, border: `2px solid ${active ? 'var(--text-primary)' : 'var(--border-color)'}`, background: active ? 'var(--text-primary)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {active && <Check size={10} style={{ color: 'var(--bg-primary)' }} />}
                  </div>
                </button>
              )
            })}
          </div>
          <p className="text-2xs text-surface-400 mt-1.5">{t('settings.typefaceHint')}</p>
        </div>

        <div>
          <SubHeader>{t('settings.language')}</SubHeader>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
            {LANGUAGES.map(({ value, label, native }) => {
              const active = language === value
              return (
                <button key={value} onClick={() => setLanguage(value)}
                  style={{
                    padding: '10px 8px', borderRadius: 3, cursor: 'pointer', textAlign: 'center', position: 'relative',
                    border: active ? '2px solid var(--text-primary)' : '1px solid var(--border-color)',
                    background: active ? 'var(--surface-active)' : 'var(--bg-primary)',
                  }}>
                  {active && (
                    <span style={{ position: 'absolute', top: 4, right: 4, width: 14, height: 14, borderRadius: '50%', background: 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Check size={8} style={{ color: 'var(--bg-primary)' }} />
                    </span>
                  )}
                  <div style={{ fontSize: 18, marginBottom: 4, lineHeight: 1 }}>{native}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-subtle)', fontWeight: active ? 600 : 400 }}>{label}</div>
                </button>
              )
            })}
          </div>
          <p className="text-2xs text-surface-400 mt-1.5">{t('settings.languageHint')}</p>
        </div>
      </section>
    </>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────

const TABS: { id: SettingsTab; label: string; Icon: typeof Settings }[] = [
  { id: 'general',    label: 'General',    Icon: Settings },
  { id: 'appearance', label: 'Appearance', Icon: Palette  },
  { id: 'ai',         label: 'AI & Automation', Icon: Brain    },
]

interface Props {
  open: boolean
  defaultTab?: SettingsTab
  onClose: () => void
  exitTarget?: { x: number; y: number } | null
}

export function SettingsModal({ open, defaultTab = 'general', onClose, exitTarget }: Props) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(defaultTab)

  useEffect(() => {
    if (open) setActiveTab(defaultTab)
  }, [open, defaultTab])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
    <motion.div
      key="settings-backdrop"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.28 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <motion.div
        onClick={e => e.stopPropagation()}
        initial={{
          opacity: 0,
          scaleX: 0.05,
          scaleY: 0.05,
          x: exitTarget?.x ?? 0,
          y: exitTarget?.y ?? 300,
          clipPath: 'polygon(0% 0%, 100% 0%, 50% 100%, 50% 100%)',
        }}
        animate={{
          opacity: 1,
          scaleX: 1,
          scaleY: 1,
          x: 0,
          y: 0,
          clipPath: 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)',
          transition: {
            opacity: { duration: 0.18 },
            clipPath: { duration: 0.38, ease: [0.25, 0.46, 0.45, 0.94] },
            scaleY:  { duration: 0.44, ease: [0.25, 0.46, 0.45, 0.94] },
            scaleX:  { duration: 0.38, delay: 0.06, ease: [0.25, 0.46, 0.45, 0.94] },
            x:       { duration: 0.44, ease: [0.25, 0.46, 0.45, 0.94] },
            y:       { duration: 0.44, ease: [0.25, 0.46, 0.45, 0.94] },
          },
        }}
        exit={{
          opacity: 0,
          clipPath: 'polygon(0% 0%, 100% 0%, 50% 100%, 50% 100%)',
          scaleY: 0.05,
          scaleX: 0.05,
          x: exitTarget?.x ?? 0,
          y: exitTarget?.y ?? 300,
          transition: {
            clipPath: { duration: 0.22, ease: [0.55, 0.085, 0.68, 0.53] },
            scaleY:   { duration: 0.38, ease: [0.55, 0.085, 0.68, 0.53] },
            scaleX:   { duration: 0.38, ease: [0.55, 0.085, 0.68, 0.53] },
            x:        { duration: 0.42, ease: [0.55, 0.085, 0.68, 0.53] },
            y:        { duration: 0.42, ease: [0.55, 0.085, 0.68, 0.53] },
            opacity:  { duration: 0.12, delay: 0.28 },
          },
        }}
        style={{
          transformOrigin: 'bottom center',
          background: 'var(--bg-primary)',
          border: '1px solid var(--border-color)',
          borderRadius: 6,
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.22)',
          width: '100%',
          maxWidth: 840,
          height: '82vh',
          maxHeight: 660,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 16px', height: 50, flexShrink: 0,
          borderBottom: '1px solid var(--border-color)',
        }}>
          <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>
            Settings
          </span>
          <button
            onClick={onClose}
            className="flex items-center justify-center text-surface-500 hover:text-surface-700 hover:bg-surface-100 border border-surface-200 transition-colors"
            style={{ width: 26, height: 26, borderRadius: 3, background: 'transparent', cursor: 'pointer' }}
          >
            <X size={13} />
          </button>
        </div>

        {/* Body */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Sidebar */}
          <aside style={{
            width: 168, flexShrink: 0,
            background: 'var(--bg-secondary)',
            borderRight: '1px solid var(--border-color)',
            padding: '10px 8px',
          }}>
            {TABS.map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-2 w-full px-3 text-xs transition-colors text-left ${
                  activeTab === id
                    ? 'bg-surface-200 text-surface-800 font-semibold'
                    : 'text-surface-500 hover:bg-surface-100 font-normal'
                }`}
                style={{ height: 32, borderRadius: 3, border: 'none', cursor: 'pointer' }}
              >
                <Icon size={13} className="flex-none" />
                {label}
              </button>
            ))}
          </aside>

          {/* Cross-dissolve tabs — iOS tab switching */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', position: 'relative' }}>
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
              >
                {activeTab === 'general'    && <GeneralTab />}
                {activeTab === 'appearance' && <AppearanceTab />}
                {activeTab === 'ai'         && <AITab />}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </motion.div>
      )}
    </AnimatePresence>
  )
}
