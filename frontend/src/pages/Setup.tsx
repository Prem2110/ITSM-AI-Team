import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { completeSetup } from '@/api/setup'
import client from '@/api/client'
import { setFakeUser } from '@/api/auth'
import { ChevronRight, ChevronLeft, Check, X, Plus } from 'lucide-react'

interface Priority {
  level: number
  name: string
  sla_hours: number
}

const DEFAULT_RESOLUTION_CODES = [
  'Fixed',
  'Workaround',
  'No Fault Found',
  'User Error',
  'Duplicate',
  'Cannot Reproduce',
]

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

function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

interface WizardState {
  companyName: string
  timezone: string
  adminName: string
  adminEmail: string
  slaTargets: Record<string, number>
  resolutionCodes: string[]
}

const TIMEZONES = getTimezones()
const TOTAL_STEPS = 6

export default function Setup() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [step, setStep] = useState(1)
  const [priorities, setPriorities] = useState<Priority[]>([])
  const [newCode, setNewCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [alreadyDone, setAlreadyDone] = useState(false)
  const [form, setForm] = useState<WizardState>({
    companyName: '',
    timezone: getBrowserTimezone(),
    adminName: '',
    adminEmail: '',
    slaTargets: { '1': 4, '2': 8, '3': 24, '4': 72 },
    resolutionCodes: [...DEFAULT_RESOLUTION_CODES],
  })

  useEffect(() => {
    client.get('/setup/status').then((r) => {
      if (r.data.completed) setAlreadyDone(true)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    client.get<Priority[]>('/config/priorities').then((r) => {
      setPriorities(r.data)
      const defaults: Record<string, number> = {}
      r.data.forEach((p) => {
        defaults[String(p.level)] = p.sla_hours
      })
      setForm((f) => ({ ...f, slaTargets: defaults }))
    }).catch(() => {})
  }, [])

  function next() {
    setStep((s) => Math.min(s + 1, TOTAL_STEPS))
  }
  function back() {
    setStep((s) => Math.max(s - 1, 1))
  }

  function removeCode(idx: number) {
    setForm((f) => ({ ...f, resolutionCodes: f.resolutionCodes.filter((_, i) => i !== idx) }))
  }

  function addCode() {
    const c = newCode.trim()
    if (c && !form.resolutionCodes.includes(c)) {
      setForm((f) => ({ ...f, resolutionCodes: [...f.resolutionCodes, c] }))
    }
    setNewCode('')
  }

  async function submit() {
    setSubmitting(true)
    setError(null)
    try {
      const result = await completeSetup({
        company_name: form.companyName,
        timezone: form.timezone,
        admin: { name: form.adminName, email: form.adminEmail },
        sla_targets: form.slaTargets,
        resolution_codes: form.resolutionCodes,
      })
      setFakeUser(result.admin.email)
      qc.invalidateQueries({ queryKey: ['setup-status'] })
      navigate('/incidents', { replace: true })
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'An error occurred. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function canProceed(): boolean {
    if (step === 2) return form.companyName.trim().length > 0
    if (step === 3) {
      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.adminEmail)
      return form.adminName.trim().length > 0 && emailOk
    }
    if (step === 4) return Object.values(form.slaTargets).every((v) => Number(v) > 0)
    if (step === 5) return form.resolutionCodes.length > 0
    return true
  }

  const inputCls =
    'w-full border border-surface-200 bg-white text-xs px-2 py-1.5 focus:outline-none focus:border-surface-400'

  if (alreadyDone) {
    return (
      <div className="min-h-screen bg-surface-50 flex items-center justify-center">
        <div
          className="bg-white border border-surface-200 px-8 py-6 text-center"
          style={{ borderRadius: 3, maxWidth: 360 }}
        >
          <div className="text-sm font-semibold text-surface-800 mb-2">Setup already complete</div>
          <p className="text-xs text-surface-500 mb-4">
            This instance has already been configured.
          </p>
          <Link
            to="/incidents"
            className="text-xs text-surface-700 underline hover:text-surface-900"
          >
            Go to incidents →
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div
      className="min-h-screen bg-surface-50 flex items-center justify-center"
      style={{ padding: '40px 16px' }}
    >
      <div
        className="bg-white border border-surface-200 w-full"
        style={{ maxWidth: 520, borderRadius: 3 }}
      >
        {/* Progress bar */}
        <div className="px-6 pt-5 pb-0">
          <div className="flex items-center gap-1 mb-4">
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
              <div
                key={i}
                className="flex-1 transition-colors"
                style={{
                  height: 3,
                  borderRadius: 2,
                  background: i < step ? 'var(--text-primary)' : 'var(--border-color)',
                }}
              />
            ))}
          </div>
          <div className="text-2xs text-surface-400 uppercase tracking-widest mb-1">
            Step {step} of {TOTAL_STEPS}
          </div>
        </div>

        <div className="px-6 pb-4 pt-3" style={{ minHeight: 260 }}>
          {/* Step 1: Welcome */}
          {step === 1 && (
            <div>
              <h1
                className="font-semibold text-surface-800 mb-2"
                style={{ fontSize: 16 }}
              >
                Welcome to ITSM
              </h1>
              <p className="text-xs text-surface-500 mb-6" style={{ lineHeight: 1.6 }}>
                Let's get your instance set up. This takes about 3 minutes.
                <br />
                You'll configure your company info, create the first admin account, and set SLA
                targets.
              </p>
              <button
                onClick={next}
                className="bg-surface-800 text-white text-xs font-medium px-4 py-2 hover:bg-surface-700 transition-colors"
                style={{ borderRadius: 2 }}
              >
                Get Started
              </button>
            </div>
          )}

          {/* Step 2: Company info */}
          {step === 2 && (
            <div>
              <h2 className="text-sm font-semibold text-surface-800 mb-4">
                Company information
              </h2>
              <div className="mb-3">
                <label className="block text-xs font-medium text-surface-600 mb-1">
                  Company name *
                </label>
                <input
                  type="text"
                  value={form.companyName}
                  onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
                  placeholder="Acme Corporation"
                  className={inputCls}
                  style={{ borderRadius: 2 }}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-surface-600 mb-1">
                  Timezone *
                </label>
                <select
                  value={form.timezone}
                  onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
                  className={inputCls}
                  style={{ borderRadius: 2 }}
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Step 3: Admin user */}
          {step === 3 && (
            <div>
              <h2 className="text-sm font-semibold text-surface-800 mb-1">Admin account</h2>
              <p className="text-xs text-surface-400 mb-4" style={{ lineHeight: 1.6 }}>
                This account becomes the first admin. You can invite more users from Settings
                later.
              </p>
              <div className="mb-3">
                <label className="block text-xs font-medium text-surface-600 mb-1">
                  Your name *
                </label>
                <input
                  type="text"
                  value={form.adminName}
                  onChange={(e) => setForm((f) => ({ ...f, adminName: e.target.value }))}
                  placeholder="Alex Admin"
                  className={inputCls}
                  style={{ borderRadius: 2 }}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-surface-600 mb-1">
                  Email address *
                </label>
                <input
                  type="email"
                  value={form.adminEmail}
                  onChange={(e) => setForm((f) => ({ ...f, adminEmail: e.target.value }))}
                  placeholder="admin@company.com"
                  className={inputCls}
                  style={{ borderRadius: 2 }}
                />
              </div>
            </div>
          )}

          {/* Step 4: SLA targets */}
          {step === 4 && (
            <div>
              <h2 className="text-sm font-semibold text-surface-800 mb-1">SLA targets</h2>
              <p className="text-xs text-surface-400 mb-4">
                Resolution time targets per priority level (hours).
              </p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-surface-200">
                    <th className="text-left pb-2 text-surface-500 font-medium">Priority</th>
                    <th className="text-right pb-2 text-surface-500 font-medium">Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {[1, 2, 3, 4].map((level) => {
                    const p = priorities.find((x) => x.level === level)
                    return (
                      <tr key={level} className="border-b border-surface-100">
                        <td className="py-2 text-surface-700">
                          P{level}
                          {p ? ` – ${p.name}` : ''}
                        </td>
                        <td className="py-2 flex justify-end">
                          <input
                            type="number"
                            min={1}
                            value={form.slaTargets[String(level)] ?? ''}
                            onChange={(e) =>
                              setForm((f) => ({
                                ...f,
                                slaTargets: {
                                  ...f.slaTargets,
                                  [String(level)]: Number(e.target.value),
                                },
                              }))
                            }
                            className="border border-surface-200 bg-white text-xs px-2 py-1 focus:outline-none focus:border-surface-400 text-right"
                            style={{ borderRadius: 2, width: 72 }}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Step 5: Resolution codes */}
          {step === 5 && (
            <div>
              <h2 className="text-sm font-semibold text-surface-800 mb-1">
                Resolution codes
              </h2>
              <p className="text-xs text-surface-400 mb-3">
                Codes agents select when resolving an incident. At least one required.
              </p>
              <div className="flex flex-col gap-1 mb-3">
                {form.resolutionCodes.map((code, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between border border-surface-200 bg-surface-50 px-2 py-1"
                    style={{ borderRadius: 2 }}
                  >
                    <span className="text-xs text-surface-700">{code}</span>
                    <button
                      onClick={() => removeCode(idx)}
                      className="text-surface-400 hover:text-surface-700 transition-colors ml-2 flex-none"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-1">
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
            </div>
          )}

          {/* Step 6: Review */}
          {step === 6 && (
            <div>
              <h2 className="text-sm font-semibold text-surface-800 mb-4">
                Review &amp; complete
              </h2>
              <div className="space-y-1 text-xs">
                <ReviewRow label="Company" value={form.companyName} />
                <ReviewRow label="Timezone" value={form.timezone} />
                <ReviewRow label="Admin name" value={form.adminName} />
                <ReviewRow label="Admin email" value={form.adminEmail} />
                <div className="border-t border-surface-100 pt-3 mt-3">
                  <div className="text-2xs font-semibold text-surface-400 uppercase tracking-widest mb-2">
                    SLA Targets
                  </div>
                  {[1, 2, 3, 4].map((level) => {
                    const p = priorities.find((x) => x.level === level)
                    return (
                      <div key={level} className="flex justify-between py-0.5">
                        <span className="text-surface-500">
                          P{level}
                          {p ? ` – ${p.name}` : ''}
                        </span>
                        <span className="text-surface-700 font-medium">
                          {form.slaTargets[String(level)]}h
                        </span>
                      </div>
                    )
                  })}
                </div>
                <div className="border-t border-surface-100 pt-3 mt-3">
                  <div className="text-2xs font-semibold text-surface-400 uppercase tracking-widest mb-2">
                    Resolution Codes
                  </div>
                  <div className="text-surface-700">{form.resolutionCodes.join(', ')}</div>
                </div>
              </div>
              {error && (
                <div
                  className="mt-4 text-xs text-red-600 border border-red-200 bg-red-50 px-3 py-2"
                  style={{ borderRadius: 2 }}
                >
                  {error}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Nav buttons */}
        <div
          className="flex items-center justify-between px-6 py-3 border-t border-surface-200 bg-surface-50"
          style={{ borderRadius: '0 0 3px 3px' }}
        >
          <button
            onClick={back}
            disabled={step === 1}
            className="flex items-center gap-1 text-xs text-surface-500 hover:text-surface-700 disabled:opacity-0 transition-colors"
          >
            <ChevronLeft size={14} />
            Back
          </button>

          {step < TOTAL_STEPS ? (
            <button
              onClick={next}
              disabled={!canProceed()}
              className="flex items-center gap-1 bg-surface-800 text-white text-xs font-medium px-3 py-1.5 hover:bg-surface-700 disabled:opacity-40 transition-colors"
              style={{ borderRadius: 2 }}
            >
              Next
              <ChevronRight size={14} />
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={submitting}
              className="flex items-center gap-1 bg-surface-800 text-white text-xs font-medium px-3 py-1.5 hover:bg-surface-700 disabled:opacity-40 transition-colors"
              style={{ borderRadius: 2 }}
            >
              {submitting ? 'Setting up…' : 'Complete Setup'}
              {!submitting && <Check size={14} />}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-0.5">
      <span className="text-surface-500">{label}</span>
      <span className="text-surface-700 font-medium truncate ml-4 max-w-xs text-right">{value}</span>
    </div>
  )
}
