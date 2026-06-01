import { useState, useEffect, type ReactNode } from 'react'
import {
  X, Settings, Palette, Plus, Loader2,
  Monitor, Moon, Sun, Check,
} from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useAppSettings } from '@/hooks/useAppSettings'
import { patchAppSettings } from '@/api/setup'
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

export type SettingsTab = 'general' | 'appearance'

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

  const [companyName, setCompanyName] = useState('')
  const [timezone, setTimezone]       = useState('UTC')
  const [slaTargets, setSlaTargets]   = useState<Record<string, number>>({ '0': 1, '1': 4, '2': 8, '3': 24, '4': 72 })
  const [codes, setCodes]             = useState<string[]>([])
  const [newCode, setNewCode]         = useState('')
  const [saving, setSaving]           = useState<string | null>(null)
  const [saved, setSaved]             = useState<string | null>(null)

  useEffect(() => {
    if (settings) {
      setCompanyName(settings.company_name)
      setTimezone(settings.timezone)
      setSlaTargets(settings.sla_targets ?? { '0': 1, '1': 4, '2': 8, '3': 24, '4': 72 })
      setCodes(settings.resolution_codes ?? [])
    }
  }, [settings])

  async function saveSection(section: string, fields: object) {
    setSaving(section); setSaved(null)
    try {
      await patchAppSettings(fields)
      qc.invalidateQueries({ queryKey: ['app-settings'] })
      qc.invalidateQueries({ queryKey: ['setup-status'] })
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
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
]

interface Props {
  open: boolean
  defaultTab?: SettingsTab
  onClose: () => void
}

export function SettingsModal({ open, defaultTab = 'general', onClose }: Props) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(defaultTab)
  const [visible,   setVisible]   = useState(false)
  const [exiting,   setExiting]   = useState(false)

  useEffect(() => {
    if (open) {
      setActiveTab(defaultTab)
      setVisible(true)
      setExiting(false)
    } else if (visible) {
      setExiting(true)
      const t = setTimeout(() => { setVisible(false); setExiting(false) }, 200)
      return () => clearTimeout(t)
    }
  }, [open])

  useEffect(() => {
    if (!visible) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [visible, onClose])

  if (!visible) return null

  return (
    <div
      onClick={onClose}
      className={exiting ? 'animate-backdrop-exit' : 'animate-backdrop-enter'}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className={exiting ? 'animate-modal-exit' : 'animate-modal-enter'}
        style={{
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

          {/* Content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
            {activeTab === 'general'    && <GeneralTab />}
            {activeTab === 'appearance' && <AppearanceTab />}
          </div>
        </div>
      </div>
    </div>
  )
}
