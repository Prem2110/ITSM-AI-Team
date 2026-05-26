import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Monitor, Moon, Sun, Check } from 'lucide-react'
import { useSettings, type Theme, type FontSize, type FontFamily } from '@/contexts/SettingsContext'

// ─── data ────────────────────────────────────────────────────────────────────

const THEMES: { value: Theme; label: string; Icon: typeof Sun; description: string }[] = [
  { value: 'light', label: 'Light',  Icon: Sun,     description: 'Always light' },
  { value: 'dark',  label: 'Dark',   Icon: Moon,    description: 'Always dark'  },
  { value: 'system',label: 'System', Icon: Monitor, description: 'Follow OS'    },
]

const FONT_SIZES: { value: FontSize; label: string; previewPx: number }[] = [
  { value: 'compact',     label: 'Compact',     previewPx: 11 },
  { value: 'default',     label: 'Default',     previewPx: 13 },
  { value: 'comfortable', label: 'Comfortable', previewPx: 14 },
  { value: 'large',       label: 'Large',       previewPx: 16 },
]

const FONTS: { value: FontFamily; label: string; stack: string; tagline: string }[] = [
  {
    value: 'system',
    label: 'System',
    stack: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    tagline: 'Native OS font',
  },
  {
    value: 'google-sans',
    label: 'Google Sans',
    stack: '"Google Sans", sans-serif',
    tagline: 'Clean · friendly',
  },
  {
    value: 'ibm-plex',
    label: 'IBM Plex Sans',
    stack: '"IBM Plex Sans", sans-serif',
    tagline: 'Technical · enterprise',
  },
  {
    value: 'dm-sans',
    label: 'DM Sans',
    stack: '"DM Sans", sans-serif',
    tagline: 'Modern · geometric',
  },
]

// ─── mini UI mockup inside theme cards ───────────────────────────────────────

function ThemePreview({ dark }: { dark: boolean }) {
  const bg      = dark ? '#0f172a' : '#f1f5f9'
  const panel   = dark ? '#1e293b' : '#ffffff'
  const sidebar = dark ? '#0a1120' : '#f8fafc'
  const border  = dark ? '#334155' : '#e2e8f0'
  const bar     = dark ? '#334155' : '#e2e8f0'
  const row1    = dark ? '#94a3b8' : '#475569'
  const row2    = dark ? '#475569' : '#94a3b8'

  return (
    <div style={{
      width: '100%', height: 60, background: bg,
      borderRadius: 2, overflow: 'hidden',
      display: 'flex', border: `1px solid ${border}`,
    }}>
      {/* sidebar strip */}
      <div style={{
        width: 28, background: sidebar,
        borderRight: `1px solid ${border}`,
        padding: '5px 4px',
        display: 'flex', flexDirection: 'column', gap: 3,
      }}>
        {[0.8, 0.6, 0.6].map((w, i) => (
          <div key={i} style={{
            height: 3, borderRadius: 1,
            background: i === 0 ? bar : row2,
            opacity: 0.7, width: `${w * 100}%`,
          }} />
        ))}
      </div>
      {/* content */}
      <div style={{ flex: 1, background: panel, padding: '5px 6px', display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ height: 4, width: '55%', borderRadius: 1, background: bar }} />
        {[1, 0.8, 0.7].map((w, i) => (
          <div key={i} style={{
            height: 3, borderRadius: 1,
            background: i === 0 ? row1 : row2,
            opacity: 0.5, width: `${w * 100}%`,
          }} />
        ))}
      </div>
    </div>
  )
}

// ─── page ────────────────────────────────────────────────────────────────────

export default function Settings() {
  const navigate = useNavigate()
  const { theme, fontSize, fontFamily, setTheme, setFontSize, setFontFamily } = useSettings()

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
        <span className="font-semibold text-surface-900" style={{ fontSize: 15 }}>Settings</span>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto bg-surface-50" style={{ padding: '24px 28px' }}>
        <div style={{ maxWidth: 580 }}>

          {/* ── Appearance ── */}
          <section className="mb-8">
            <div
              className="text-2xs font-semibold text-surface-400 uppercase tracking-widest pb-2 mb-5 border-b border-surface-200"
            >
              Appearance
            </div>

            {/* Theme */}
            <div className="mb-6">
              <div className="text-xs font-semibold text-surface-600 mb-3 uppercase tracking-wider" style={{ fontSize: 11 }}>Theme</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {THEMES.map(({ value, label, Icon, description }) => {
                  const active = theme === value
                  const previewDark =
                    value === 'dark' ||
                    (value === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
                  return (
                    <button
                      key={value}
                      onClick={() => setTheme(value)}
                      style={{
                        padding: 10,
                        borderRadius: 3,
                        border: active ? '2px solid var(--text-primary)' : '1px solid var(--border-color)',
                        background: active ? 'var(--surface-active)' : 'var(--bg-primary)',
                        textAlign: 'left',
                        cursor: 'pointer',
                        position: 'relative',
                      }}
                    >
                      {active && (
                        <span style={{
                          position: 'absolute', top: 6, right: 6,
                          width: 16, height: 16, borderRadius: '50%',
                          background: 'var(--text-primary)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
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

            {/* Interface Scale */}
            <div className="mb-6">
              <div className="text-xs font-semibold text-surface-600 mb-3 uppercase tracking-wider" style={{ fontSize: 11 }}>Interface Scale</div>
              <div
                className="flex border border-surface-200 bg-white"
                style={{ borderRadius: 3, overflow: 'hidden' }}
              >
                {FONT_SIZES.map((f, idx) => {
                  const active = fontSize === f.value
                  return (
                    <button
                      key={f.value}
                      onClick={() => setFontSize(f.value)}
                      className="flex-1 flex flex-col items-center justify-center transition-colors"
                      style={{
                        padding: '10px 6px',
                        background: active ? 'var(--text-primary)' : 'var(--bg-primary)',
                        borderRight: idx < FONT_SIZES.length - 1 ? '1px solid var(--border-color)' : undefined,
                        cursor: 'pointer',
                      }}
                    >
                      <span style={{
                        fontSize: f.previewPx,
                        fontWeight: 600,
                        lineHeight: 1,
                        marginBottom: 4,
                        color: active ? 'var(--bg-primary)' : 'var(--text-primary)',
                      }}>
                        Aa
                      </span>
                      <span style={{
                        fontSize: 10,
                        fontWeight: active ? 600 : 400,
                        color: active ? 'var(--bg-secondary)' : 'var(--text-subtle)',
                        opacity: active ? 0.8 : 1,
                      }}>
                        {f.label}
                      </span>
                    </button>
                  )
                })}
              </div>
              <p className="text-2xs text-surface-400 mt-1.5">
                Scales the entire interface. Takes effect immediately.
              </p>
            </div>

            {/* Font */}
            <div>
              <div className="text-xs font-semibold text-surface-600 mb-3 uppercase tracking-wider" style={{ fontSize: 11 }}>Typeface</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {FONTS.map(({ value, label, stack, tagline }) => {
                  const active = fontFamily === value
                  return (
                    <button
                      key={value}
                      onClick={() => setFontFamily(value)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 14,
                        padding: '12px 14px',
                        borderRadius: 3,
                        border: active ? '2px solid var(--text-primary)' : '1px solid var(--border-color)',
                        background: active ? 'var(--surface-active)' : 'var(--bg-primary)',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      {/* Sample */}
                      <div style={{ flex: 'none', width: 120 }}>
                        <span style={{
                          fontFamily: stack,
                          fontSize: 18,
                          fontWeight: 600,
                          letterSpacing: '-0.01em',
                          color: 'var(--text-primary)',
                          display: 'block',
                          lineHeight: 1.2,
                        }}>
                          Aa Bb 012
                        </span>
                      </div>
                      {/* Label */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontFamily: stack,
                          fontSize: 12,
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                          marginBottom: 2,
                        }}>
                          {label}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-subtle)' }}>{tagline}</div>
                      </div>
                      {/* Check */}
                      <div style={{
                        width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                        border: `2px solid ${active ? 'var(--text-primary)' : 'var(--border-color)'}`,
                        background: active ? 'var(--text-primary)' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {active && <Check size={10} style={{ color: 'var(--bg-primary)' }} />}
                      </div>
                    </button>
                  )
                })}
              </div>
              <p className="text-2xs text-surface-400 mt-1.5">
                IBM Plex Sans and DM Sans are loaded from Google Fonts.
              </p>
            </div>

          </section>
        </div>
      </div>
    </div>
  )
}
