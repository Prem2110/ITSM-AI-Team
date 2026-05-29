import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, X, Plus, Loader2 } from 'lucide-react'
import { useAppSettings } from '@/hooks/useAppSettings'
import { patchAppSettings } from '@/api/setup'
import { useMe } from '@/hooks/useMe'
import { usePriorities } from '@/hooks'
import { PriorityBadge } from '@/components/PriorityBadge'
import { Skeleton } from '@/components/Skeleton'

// ─── timezones ────────────────────────────────────────────────────────────────

const FALLBACK_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Kolkata',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Australia/Sydney',
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

// ─── save button ──────────────────────────────────────────────────────────────

function SaveButton({
  section,
  saving,
  saved,
  disabled,
  onClick,
}: {
  section: string
  saving: string | null
  saved: string | null
  disabled: boolean
  onClick: () => void
}) {
  const isSaving = saving === section
  const isSaved = saved === section
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

// ─── section header ───────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-2xs font-semibold text-surface-400 uppercase tracking-widest pb-2 mb-5 border-b border-surface-200">
      {children}
    </div>
  )
}

// ─── page ────────────────────────────────────────────────────────────────────

export default function AppSettings() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: me } = useMe()
  const { data: settings, isLoading } = useAppSettings()
  const { data: priorities = [] } = usePriorities()
  const isAdmin = me?.scopes?.includes('Admin') ?? false

  const [companyName, setCompanyName] = useState('')
  const [timezone, setTimezone] = useState('UTC')
  const [slaTargets, setSlaTargets] = useState<Record<string, number>>({
    '1': 4,
    '2': 8,
    '3': 24,
    '4': 72,
  })
  const [codes, setCodes] = useState<string[]>([])
  const [newCode, setNewCode] = useState('')
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  useEffect(() => {
    if (settings) {
      setCompanyName(settings.company_name)
      setTimezone(settings.timezone)
      setSlaTargets(settings.sla_targets ?? { '1': 4, '2': 8, '3': 24, '4': 72 })
      setCodes(settings.resolution_codes ?? [])
    }
  }, [settings])

  async function saveSection(section: string, fields: object) {
    setSaving(section)
    setSaved(null)
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
    if (c && !codes.includes(c)) {
      setCodes((prev) => [...prev, c])
    }
    setNewCode('')
  }

  function removeCode(idx: number) {
    setCodes((prev) => prev.filter((_, i) => i !== idx))
  }

  const inputCls =
    'w-full border border-surface-200 bg-white text-xs px-2 py-1.5 focus:outline-none focus:border-surface-400'
  const disabledInputCls =
    'w-full border border-surface-100 bg-surface-50 text-xs px-2 py-1.5 text-surface-500 cursor-not-allowed'

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div
        className="flex-none flex items-center gap-3 px-4 bg-white border-b border-surface-200"
        style={{ height: 44 }}
      >
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-xs text-surface-500 hover:text-surface-700 transition-colors"
        >
          <ChevronLeft size={14} />
          Back
        </button>
        <span className="text-surface-300 flex-none">|</span>
        <span className="font-semibold text-surface-900" style={{ fontSize: 15 }}>
          Settings
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto bg-surface-50" style={{ padding: '24px 28px' }}>
        <div style={{ maxWidth: 580 }}>

          {isLoading && (
            <div className="flex flex-col gap-6 py-2">
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
          )}

          {!isLoading && !isAdmin && (
            <div
              className="mb-5 border border-surface-200 bg-white px-4 py-3 text-xs text-surface-500"
              style={{ borderRadius: 2 }}
            >
              You have read-only access. Contact an administrator to make changes.
            </div>
          )}

          {!isLoading && (
            <>
              {/* ── Company ── */}
              <section className="mb-8">
                <SectionHeader>Company</SectionHeader>

                <div className="mb-3">
                  <label className="block text-xs font-medium text-surface-600 mb-1">
                    Company name
                  </label>
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    disabled={!isAdmin}
                    placeholder="Acme Corporation"
                    className={isAdmin ? inputCls : disabledInputCls}
                    style={{ borderRadius: 2 }}
                  />
                </div>

                <div className="mb-4">
                  <label className="block text-xs font-medium text-surface-600 mb-1">
                    Timezone
                  </label>
                  {isAdmin ? (
                    <select
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      className={inputCls}
                      style={{ borderRadius: 2 }}
                    >
                      {TIMEZONES.map((tz) => (
                        <option key={tz} value={tz}>
                          {tz}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={timezone}
                      disabled
                      className={disabledInputCls}
                      style={{ borderRadius: 2 }}
                    />
                  )}
                </div>

                {isAdmin && (
                  <SaveButton
                    section="company"
                    saving={saving}
                    saved={saved}
                    disabled={!companyName.trim()}
                    onClick={() =>
                      saveSection('company', {
                        company_name: companyName,
                        timezone,
                      })
                    }
                  />
                )}
              </section>

              {/* ── SLA Targets ── */}
              <section className="mb-8">
                <SectionHeader>SLA Targets</SectionHeader>
                <p className="text-xs text-surface-400 mb-4">
                  Resolution time targets per priority level (hours).
                </p>

                <table className="w-full text-xs mb-4">
                  <thead>
                    <tr className="border-b border-surface-200">
                      <th className="text-left pb-2 text-surface-500 font-medium">Priority</th>
                      <th className="text-right pb-2 text-surface-500 font-medium">Hours</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[1, 2, 3, 4].map((level) => (
                      <tr key={level} className="border-b border-surface-100">
                        <td className="py-2">
                          <PriorityBadge priority={level} priorities={priorities} />
                        </td>
                        <td className="py-2 flex justify-end">
                          <input
                            type="number"
                            min={1}
                            value={slaTargets[String(level)] ?? ''}
                            onChange={(e) =>
                              setSlaTargets((prev) => ({
                                ...prev,
                                [String(level)]: Number(e.target.value),
                              }))
                            }
                            disabled={!isAdmin}
                            className="border border-surface-200 bg-white text-xs px-2 py-1 focus:outline-none focus:border-surface-400 text-right disabled:bg-surface-50 disabled:text-surface-500 disabled:cursor-not-allowed"
                            style={{ borderRadius: 2, width: 72 }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {isAdmin && (
                  <SaveButton
                    section="sla"
                    saving={saving}
                    saved={saved}
                    disabled={Object.values(slaTargets).some((v) => !v || v < 1)}
                    onClick={() => saveSection('sla', { sla_targets: slaTargets })}
                  />
                )}
              </section>

              {/* ── Resolution Codes ── */}
              <section className="mb-8">
                <SectionHeader>Resolution Codes</SectionHeader>
                <p className="text-xs text-surface-400 mb-4">
                  Codes agents select when resolving an incident.
                </p>

                <div className="flex flex-col gap-1 mb-3">
                  {codes.map((code, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between border border-surface-200 bg-white px-2 py-1"
                      style={{ borderRadius: 2 }}
                    >
                      <span className="text-xs text-surface-700">{code}</span>
                      {isAdmin && (
                        <button
                          onClick={() => removeCode(idx)}
                          className="text-surface-400 hover:text-surface-700 transition-colors ml-2 flex-none"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  ))}
                  {codes.length === 0 && (
                    <div className="text-xs text-surface-400 py-1">No resolution codes defined.</div>
                  )}
                </div>

                {isAdmin && (
                  <>
                    <div className="flex gap-1 mb-4">
                      <input
                        type="text"
                        value={newCode}
                        onChange={(e) => setNewCode(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addCode()}
                        placeholder="Add a code…"
                        className="flex-1 border border-surface-200 bg-white text-xs px-2 py-1.5 focus:outline-none focus:border-surface-400"
                        style={{ borderRadius: 2 }}
                      />
                      <button
                        onClick={addCode}
                        disabled={!newCode.trim()}
                        className="border border-surface-200 px-2 py-1 text-xs text-surface-600 hover:bg-surface-50 disabled:opacity-40 transition-colors flex items-center"
                        style={{ borderRadius: 2 }}
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                    <SaveButton
                      section="codes"
                      saving={saving}
                      saved={saved}
                      disabled={codes.length === 0}
                      onClick={() => saveSection('codes', { resolution_codes: codes })}
                    />
                  </>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
