import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { useTranslation } from 'react-i18next'
import { useDashboard, useDashboardTrends, useDashboardSlaCompliance, useDashboardTopCategories } from '@/hooks/useDashboard'
import { usePriorities } from '@/hooks'

// ─── Count-up ─────────────────────────────────────────────────────────────────

function useCountUp(target: number, duration = 650) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (target === 0) { setCount(0); return }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) { setCount(target); return }
    let start: number | null = null
    let raf: number
    function tick(ts: number) {
      if (start === null) start = ts
      const t = Math.min((ts - start) / duration, 1)
      const eased = 1 - Math.pow(1 - t, 3)
      setCount(Math.round(eased * target))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return count
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Sk({ h = 14, w = '100%', className = '' }: { h?: number; w?: string | number; className?: string }) {
  return (
    <div
      className={className}
      style={{
        height: h,
        width: w,
        borderRadius: 3,
        background: 'linear-gradient(90deg, var(--shimmer-base) 25%, var(--shimmer-highlight) 50%, var(--shimmer-base) 75%)',
        backgroundSize: '300% 100%',
        animation: 'skeleton-shimmer 1.6s ease-in-out infinite',
      }}
    />
  )
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string
  value: number | undefined
  href: string
  accent?: string
  loading: boolean
}

function StatCard({ label, value, href, accent = '#6366f1', loading }: StatCardProps) {
  const navigate = useNavigate()
  const count = useCountUp(loading ? 0 : (value ?? 0))

  if (loading) {
    return (
      <div className="bg-white border border-surface-200 px-4 pt-4 pb-5" style={{ borderRadius: 4 }}>
        <Sk h={10} w="55%" />
        <Sk h={32} w="45%" className="mt-2" />
      </div>
    )
  }
  return (
    <button
      onClick={() => navigate(href)}
      className="stat-card bg-white border border-surface-200 px-4 pt-4 pb-5 text-left w-full animate-content-enter"
      style={{ borderRadius: 4 }}
    >
      <div className="text-2xs font-semibold text-surface-400 uppercase tracking-wider mb-1.5">
        {label}
      </div>
      <div className="text-3xl font-bold leading-none tabular-nums" style={{ color: accent }}>
        {count}
      </div>
    </button>
  )
}

// ─── Panel ────────────────────────────────────────────────────────────────────

function Panel({ title, children, loading }: { title: string; children: React.ReactNode; loading?: boolean }) {
  return (
    <div className="bg-white border border-surface-200" style={{ borderRadius: 4 }}>
      <div className="px-4 py-3 border-b border-surface-100">
        <span className="text-2xs font-semibold text-surface-400 uppercase tracking-wider">{title}</span>
      </div>
      <div className="px-4 py-4">
        {loading ? (
          <div className="flex flex-col gap-2">
            <Sk h={12} w="80%" />
            <Sk h={12} w="65%" />
            <Sk h={12} w="72%" />
            <Sk h={80} />
          </div>
        ) : children}
      </div>
    </div>
  )
}

// ─── Trend Chart ──────────────────────────────────────────────────────────────

function formatDate(s: string) {
  const d = new Date(s + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function TrendChart() {
  const { data, isLoading } = useDashboardTrends(14)
  const { t } = useTranslation()

  if (isLoading || !data) {
    return (
      <Panel title={t('dashboard.newVsResolved')} loading>
        <div />
      </Panel>
    )
  }

  const chartData = data.dates.map((date, i) => ({
    date: formatDate(date),
    [t('dashboard.new')]:      data.new_counts[i],
    [t('dashboard.resolved')]: data.resolved_counts[i],
  }))

  return (
    <Panel title={t('dashboard.newVsResolved')}>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={chartData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: '#94a3b8' }}
            tickLine={false}
            axisLine={false}
            interval={2}
          />
          <YAxis
            tick={{ fontSize: 10, fill: '#94a3b8' }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{ fontSize: 11, borderRadius: 3, border: '1px solid #e2e8f0', boxShadow: '0 2px 6px rgba(0,0,0,.08)' }}
            labelStyle={{ fontSize: 11, fontWeight: 600, color: '#334155' }}
          />
          <Line
            type="monotone"
            dataKey={t('dashboard.new')}
            stroke="#6366f1"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3 }}
          />
          <Line
            type="monotone"
            dataKey={t('dashboard.resolved')}
            stroke="#22c55e"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
      <div className="flex items-center gap-4 mt-2">
        <span className="flex items-center gap-1.5 text-2xs text-surface-500">
          <span className="inline-block w-3 h-0.5 rounded" style={{ background: '#6366f1' }} />
          {t('dashboard.new')}
        </span>
        <span className="flex items-center gap-1.5 text-2xs text-surface-500">
          <span className="inline-block w-3 h-0.5 rounded" style={{ background: '#22c55e' }} />
          {t('dashboard.resolved')}
        </span>
      </div>
    </Panel>
  )
}

// ─── SLA Compliance ───────────────────────────────────────────────────────────

function slaColor(pct: number) {
  if (pct >= 90) return '#15803d'
  if (pct >= 70) return '#a16207'
  return '#b91c1c'
}

function SlaWidget() {
  const { data, isLoading } = useDashboardSlaCompliance(30)
  const { t } = useTranslation()

  if (isLoading || !data) {
    return (
      <Panel title={t('dashboard.slaCompliance')} loading>
        <div />
      </Panel>
    )
  }

  const color = slaColor(data.compliance_pct)
  const hasData = data.total > 0

  return (
    <Panel title={t('dashboard.slaCompliance')}>
      <div className="flex flex-col items-center justify-center py-4">
        {hasData ? (
          <>
            <div className="text-5xl font-bold leading-none mb-2" style={{ color }}>
              {data.compliance_pct.toFixed(1)}%
            </div>
            <div className="text-xs text-surface-500">
              {t('dashboard.resolvedOnTime', { met: data.met, total: data.total })}
            </div>
            {/* Progress bar */}
            <div className="w-full mt-4 bg-surface-100 rounded" style={{ height: 6, borderRadius: 3 }}>
              <div
                className="h-full rounded transition-all"
                style={{ width: `${data.compliance_pct}%`, background: color, borderRadius: 3 }}
              />
            </div>
          </>
        ) : (
          <div className="text-xs text-surface-400 py-4">{t('dashboard.noResolved')}</div>
        )}
      </div>
    </Panel>
  )
}

// ─── Priority Bar ─────────────────────────────────────────────────────────────

const P_COLORS: Record<number, string> = {
  1: '#b91c1c',
  2: '#c2410c',
  3: '#a16207',
  4: '#15803d',
}

function PriorityBarChart() {
  const { data: summary, isLoading } = useDashboard()
  const { data: priorities = [] } = usePriorities()
  const { t } = useTranslation()

  if (isLoading || !summary) {
    return (
      <Panel title={t('dashboard.openByPriority')} loading>
        <div />
      </Panel>
    )
  }

  const chartData = [1, 2, 3, 4].map((level) => ({
    level,
    count: summary.by_priority[level] ?? 0,
  }))

  const CustomTick = ({ x, y, payload }: any) => {
    const level = payload.value as number
    const style = {
      1: { bg: 'rgba(220,38,38,0.10)', border: 'rgba(220,38,38,0.28)', text: '#b91c1c', name: 'Critical' },
      2: { bg: 'rgba(234,88,12,0.10)', border: 'rgba(234,88,12,0.28)', text: '#c2410c', name: 'High' },
      3: { bg: 'rgba(202,138,4,0.10)', border: 'rgba(202,138,4,0.28)', text: '#a16207', name: 'Medium' },
      4: { bg: 'rgba(22,163,74,0.10)', border: 'rgba(22,163,74,0.28)', text: '#15803d', name: 'Low' },
    }[level] ?? { bg: '', border: '', text: '#64748b', name: `P${level}` }
    const label = priorities.find((p) => p.level === level)?.name ?? style.name
    return (
      <foreignObject x={x - 62} y={y - 10} width={60} height={20}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            height: 20,
            padding: '0 6px',
            borderRadius: 3,
            fontSize: 11,
            fontWeight: 600,
            background: style.bg,
            border: `1px solid ${style.border}`,
            color: style.text,
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </div>
      </foreignObject>
    )
  }

  return (
    <Panel title={t('dashboard.openByPriority')}>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 0, right: 8, left: 56, bottom: 0 }}
        >
          <XAxis
            type="number"
            tick={{ fontSize: 10, fill: '#94a3b8' }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
          />
          <YAxis
            type="category"
            dataKey="level"
            tick={<CustomTick />}
            tickLine={false}
            axisLine={false}
            width={64}
          />
          <Tooltip
            formatter={(v: any) => [v, 'Open']}
            contentStyle={{ fontSize: 11, borderRadius: 3, border: '1px solid #e2e8f0' }}
          />
          <Bar dataKey="count" radius={2} maxBarSize={18}>
            {chartData.map((entry) => (
              <rect
                key={entry.level}
                fill={P_COLORS[entry.level] ?? '#64748b'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Panel>
  )
}

// ─── Top Categories ───────────────────────────────────────────────────────────

function TopCategories() {
  const { data, isLoading } = useDashboardTopCategories(30, 5)
  const { t } = useTranslation()

  const max = data && data.length > 0 ? Math.max(...data.map((c) => c.count)) : 1

  return (
    <Panel title={t('dashboard.topCategories')} loading={isLoading}>
      {data && data.length === 0 && (
        <div className="text-xs text-surface-400 py-2">{t('dashboard.noIncidents')}</div>
      )}
      {data && data.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {data.map((item, i) => (
            <div key={item.category}>
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-xs text-surface-700 truncate max-w-[160px]">{item.category}</span>
                <span className="text-xs font-semibold text-surface-500 ml-2 flex-none">{item.count}</span>
              </div>
              <div className="bg-surface-100 rounded" style={{ height: 4, borderRadius: 2 }}>
                <div
                  className="h-full rounded transition-all"
                  style={{
                    width: `${(item.count / max) * 100}%`,
                    background: ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe'][i] ?? '#6366f1',
                    borderRadius: 2,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { data: summary, isLoading: summaryLoading } = useDashboard()
  const summaryLoad = summaryLoading || !summary
  const { t } = useTranslation()

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div
        className="flex-none flex items-center px-4 bg-white border-b border-surface-200"
        style={{ height: 44 }}
      >
        <span className="font-semibold text-surface-900" style={{ fontSize: 15 }}>
          {t('dashboard.title')}
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto bg-surface-50" style={{ padding: '20px 24px' }}>
        <div style={{ maxWidth: 1100 }}>

          {/* Row 1 — Stat cards */}
          <div className="grid grid-cols-4 gap-3 mb-4">
            <StatCard label={t('dashboard.myOpen')}      value={summary?.my_open}   href="/incidents?assignee_id=me&state=new,assigned,in_progress,on_hold" accent="#6366f1" loading={summaryLoad} />
            <StatCard label={t('dashboard.allOpen')}     value={summary?.all_open}  href="/incidents?state=new,assigned,in_progress,on_hold"                 accent="#0ea5e9" loading={summaryLoad} />
            <StatCard label={t('dashboard.unassigned')}  value={summary?.unassigned} href="/incidents?assignee_id=unassigned"                               accent="#f59e0b" loading={summaryLoad} />
            <StatCard label={t('dashboard.breachedSlas')} value={summary?.breached}  href="/incidents?sla_breached=true"                                    accent="#ef4444" loading={summaryLoad} />
          </div>

          {/* Row 2 — Trend + SLA */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <TrendChart />
            <SlaWidget />
          </div>

          {/* Row 3 — Priority + Categories */}
          <div className="grid grid-cols-2 gap-3">
            <PriorityBarChart />
            <TopCategories />
          </div>

        </div>
      </div>
    </div>
  )
}
