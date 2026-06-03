import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts'
import { Brain, TrendingUp, TrendingDown, Minus, AlertTriangle, Shield, Users, Zap, Lock, Info } from 'lucide-react'
import { useAIStatus, useSLARisk, useAnomalies, useForecast, useAgentWorkload, useClassifyIncident, usePatchAISettings, useOpsSummary } from '@/hooks/useAI'
import { useMe } from '@/hooks/useMe'
import { usePriorities } from '@/hooks'
import { useSLABreachHeatmap, usePeakVolume, useReopenRate, useResolutionTime } from '@/hooks/useDashboard'
import { PriorityBadge } from '@/components/PriorityBadge'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Tip({ text, children, position = 'top' }: {
  text: string
  children: React.ReactNode
  position?: 'top' | 'bottom' | 'left' | 'right'
}) {
  const placements = {
    top:    'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left:   'right-full top-1/2 -translate-y-1/2 mr-2',
    right:  'left-full top-1/2 -translate-y-1/2 ml-2',
  }
  return (
    <div className="relative group inline-flex items-center">
      {children}
      <div className={`absolute ${placements[position]} hidden group-hover:block z-50 pointer-events-none`}>
        <div
          className="bg-surface-800 text-white text-2xs px-3 py-2 leading-snug"
          style={{ borderRadius: 4, width: 'max-content', maxWidth: 480, whiteSpace: 'normal', boxShadow: '0 4px 12px rgba(0,0,0,0.18)' }}
        >
          {text}
        </div>
      </div>
    </div>
  )
}

function InfoTip({ text }: { text: string }) {
  return (
    <Tip text={text}>
      <Info size={11} className="text-surface-300 hover:text-surface-500 cursor-help ml-1 flex-none" />
    </Tip>
  )
}

function Panel({ title, icon: Icon, children, badge, tooltip }: {
  title: string
  icon?: React.ElementType
  children: React.ReactNode
  badge?: React.ReactNode
  tooltip?: string
}) {
  return (
    <div className="bg-white border border-surface-200 flex flex-col" style={{ borderRadius: 4 }}>
      <div className="flex items-center justify-between px-4 border-b border-surface-100" style={{ height: 40 }}>
        <div className="flex items-center gap-2">
          {Icon && <Icon size={13} className="text-surface-400 flex-none" />}
          <span className="text-xs font-semibold text-surface-700">{title}</span>
          {tooltip && <InfoTip text={tooltip} />}
        </div>
        {badge}
      </div>
      <div className="flex-1 p-4">{children}</div>
    </div>
  )
}

function Sk({ h = 12, w = '100%' }: { h?: number; w?: string | number }) {
  return (
    <div style={{
      height: h, width: w, borderRadius: 3,
      background: 'linear-gradient(90deg,var(--shimmer-base)25%,var(--shimmer-highlight)50%,var(--shimmer-base)75%)',
      backgroundSize: '300% 100%', animation: 'skeleton-shimmer 1.6s ease-in-out infinite',
    }} />
  )
}

function AIBadge({ enabled }: { enabled: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-2xs font-semibold px-2 py-0.5 ${
        enabled
          ? 'bg-violet-100 text-violet-700 border border-violet-200'
          : 'bg-surface-100 text-surface-400 border border-surface-200'
      }`}
      style={{ borderRadius: 3 }}
    >
      <Brain size={10} />
      {enabled ? 'AI ON' : 'AI OFF'}
    </span>
  )
}

function RiskBar({ score, slaDue }: { score: number; slaDue: string | null }) {
  const pct = Math.round(score * 100)
  const color = score >= 1 ? '#b91c1c' : score >= 0.75 ? '#c2410c' : score >= 0.5 ? '#a16207' : '#64748b'
  const label = score >= 1 ? 'SLA breached' : score >= 0.75 ? 'Critical risk' : score >= 0.5 ? 'At risk' : 'Watch'
  const dueStr = slaDue ? `Due: ${new Date(slaDue).toLocaleString([], { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })}` : ''
  const tipText = `${label} · ${pct}% of SLA window elapsed${dueStr ? ` · ${dueStr}` : ''}`
  return (
    <Tip text={tipText} position="left">
      <div className="flex items-center gap-2 w-24">
        <div className="flex-1 bg-surface-100 rounded-full overflow-hidden" style={{ height: 5 }}>
          <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width 0.4s' }} />
        </div>
        <span className="text-2xs text-surface-500 w-8 text-right flex-none">{pct}%</span>
      </div>
    </Tip>
  )
}

// ─── SLA Risk ─────────────────────────────────────────────────────────────────

function SLARiskPanel() {
  const { data, isLoading } = useSLARisk()
  const { data: priorities } = usePriorities()

  return (
    <Panel title="SLA Risk Monitor" icon={Shield} tooltip="Open incidents ranked by how much of their SLA window has elapsed. Incidents above 40% are shown. Red = breached, orange = critical, yellow = at risk.">
      {isLoading ? (
        <div className="flex flex-col gap-2">{[...Array(4)].map((_, i) => <Sk key={i} h={28} />)}</div>
      ) : !data?.length ? (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <Shield size={24} className="text-green-500 mb-2" />
          <p className="text-xs font-medium text-surface-600">All clear</p>
          <p className="text-2xs text-surface-400 mt-1">No incidents at SLA risk</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {data.map(inc => (
            <Link
              key={inc.id}
              to={`/incidents/${inc.id}`}
              className="flex items-center gap-3 px-2 py-1.5 hover:bg-surface-50 rounded transition-colors"
              style={{ textDecoration: 'none' }}
            >
              <div className="flex-none">
                <PriorityBadge priority={inc.priority} priorities={priorities} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-surface-700 truncate">{inc.title}</div>
                <div className="text-2xs text-surface-400">{inc.number}</div>
              </div>
              <div className="flex-none">
                <RiskBar score={inc.risk_score} slaDue={inc.sla_due} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </Panel>
  )
}

// ─── Anomaly Detection ────────────────────────────────────────────────────────

const SEVERITY_STYLES = {
  critical: { bg: 'rgba(185,28,28,0.08)', border: 'rgba(185,28,28,0.25)', text: '#b91c1c', icon: '🔴' },
  high:     { bg: 'rgba(194,65,12,0.08)', border: 'rgba(194,65,12,0.25)', text: '#c2410c', icon: '🟠' },
  medium:   { bg: 'rgba(161,98,7,0.08)',  border: 'rgba(161,98,7,0.25)',  text: '#a16207', icon: '🟡' },
}

function AnomalyPanel() {
  const { data, isLoading } = useAnomalies()

  return (
    <Panel title="Anomaly Detection" icon={AlertTriangle} tooltip="Compares incidents created in the last 2 hours vs the 7-day rolling average. Flags categories with 2.5× or more than expected volume.">
      {isLoading ? (
        <div className="flex flex-col gap-2">{[...Array(3)].map((_, i) => <Sk key={i} h={52} />)}</div>
      ) : !data?.length ? (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <AlertTriangle size={24} className="text-green-500 mb-2" />
          <p className="text-xs font-medium text-surface-600">No anomalies detected</p>
          <p className="text-2xs text-surface-400 mt-1">Incident volume is within normal range</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {data.map(a => {
            const s = SEVERITY_STYLES[a.severity]
            return (
              <div
                key={a.category}
                className="px-3 py-2 flex items-center justify-between"
                style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 3 }}
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    <span>{s.icon}</span>
                    <span className="text-xs font-semibold" style={{ color: s.text }}>{a.category}</span>
                  </div>
                  <div className="text-2xs text-surface-500 mt-0.5">
                    {a.recent_count} in last 2h — {a.ratio}× expected
                  </div>
                </div>
                <Tip text={`${a.recent_count} incidents in last 2h vs ~${a.expected_count} expected — ${a.ratio}× the normal rate`} position="left">
                  <span className="text-xs font-bold cursor-help" style={{ color: s.text }}>{a.severity.toUpperCase()}</span>
                </Tip>
              </div>
            )
          })}
        </div>
      )}
    </Panel>
  )
}

// ─── Forecast ─────────────────────────────────────────────────────────────────

const TREND_ICONS = { up: TrendingUp, down: TrendingDown, stable: Minus }
const TREND_COLORS = { up: '#b91c1c', down: '#15803d', stable: '#64748b' }
const TREND_LABELS = { up: 'Increasing', down: 'Decreasing', stable: 'Stable' }

function ForecastPanel() {
  const { data, isLoading } = useForecast()

  if (isLoading) return (
    <Panel title="Incident Forecast" icon={TrendingUp}>
      <Sk h={160} />
    </Panel>
  )

  if (!data) return null

  const chartData = [
    ...data.historical_dates.map((d, i) => ({ date: d.slice(5), count: data.historical_counts[i], type: 'actual' })),
    ...data.forecast_dates.map((d, i) => ({ date: d.slice(5), forecast: data.forecast_counts[i], type: 'forecast' })),
  ]

  const TrendIcon = TREND_ICONS[data.trend]
  const trendColor = TREND_COLORS[data.trend]

  return (
    <Panel
      title="14-Day History + 7-Day Forecast"
      icon={TrendingUp}
      tooltip="Historical incident counts for the last 14 days with a 7-day linear forecast. Dashed line = projected volume based on recent trend."
      badge={
        <Tip text={`Slope: ${data.slope > 0 ? '+' : ''}${data.slope} incidents/day over the last 14 days`}>
          <div className="flex items-center gap-1 text-2xs font-medium cursor-help" style={{ color: trendColor }}>
            <TrendIcon size={11} />
            {TREND_LABELS[data.trend]}
          </div>
        </Tip>
      }
    >
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={chartData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color, #e2e8f0)" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} interval={3} />
          <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip
            contentStyle={{ fontSize: 11, border: '1px solid #e2e8f0', borderRadius: 3, padding: '4px 8px' }}
            labelStyle={{ color: '#475569', fontWeight: 600 }}
          />
          <ReferenceLine x={data.historical_dates[data.historical_dates.length - 1].slice(5)} stroke="#cbd5e1" strokeDasharray="4 2" label={{ value: 'Today', fontSize: 9, fill: '#94a3b8', position: 'top' }} />
          <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} dot={false} name="Actual" connectNulls />
          <Line type="monotone" dataKey="forecast" stroke="#a78bfa" strokeWidth={2} strokeDasharray="5 3" dot={false} name="Forecast" connectNulls />
        </LineChart>
      </ResponsiveContainer>
      <div className="flex gap-4 mt-2 justify-end">
        <div className="flex items-center gap-1.5 text-2xs text-surface-500">
          <div className="w-6 h-0.5 bg-blue-500 rounded" />
          Actual
        </div>
        <div className="flex items-center gap-1.5 text-2xs text-surface-500">
          <div className="w-6 h-0.5 rounded" style={{ background: '#a78bfa', borderTop: '2px dashed #a78bfa' }} />
          Forecast
        </div>
      </div>
    </Panel>
  )
}

// ─── Agent Workload ───────────────────────────────────────────────────────────

function AgentWorkloadPanel() {
  const { data, isLoading } = useAgentWorkload()

  return (
    <Panel title="Agent Workload" icon={Users} tooltip="Agent performance over the last 30 days. Open = currently assigned open tickets. Avg hrs = mean time from creation to resolution across all categories.">
      {isLoading ? (
        <div className="flex flex-col gap-2">{[...Array(3)].map((_, i) => <Sk key={i} h={32} />)}</div>
      ) : !data?.length ? (
        <p className="text-xs text-surface-400 py-4 text-center">No agent data available</p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-surface-100">
              <th className="text-left pb-2 text-surface-500 font-medium">Agent</th>
              <th className="text-right pb-2 text-surface-500 font-medium">
                <Tip text="Currently open tickets assigned to this agent">
                  <span className="cursor-help border-b border-dashed border-surface-400">Open</span>
                </Tip>
              </th>
              <th className="text-right pb-2 text-surface-500 font-medium">
                <Tip text="Tickets resolved or closed in the last 30 days">
                  <span className="cursor-help border-b border-dashed border-surface-400">Resolved (30d)</span>
                </Tip>
              </th>
              <th className="text-right pb-2 text-surface-500 font-medium">
                <Tip text="Average hours from incident creation to resolution (last 30 days)">
                  <span className="cursor-help border-b border-dashed border-surface-400">Avg hrs</span>
                </Tip>
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map(agent => (
              <tr key={agent.id} className="border-b border-surface-50">
                <td className="py-2">
                  <div className="font-medium text-surface-700">{agent.name}</div>
                  <div className="text-2xs text-surface-400">{agent.email}</div>
                </td>
                <td className="py-2 text-right">
                  <Tip text={agent.open_count > 5 ? 'High workload — consider reassigning' : agent.open_count > 2 ? 'Moderate workload' : 'Available capacity'} position="left">
                    <span className={`font-semibold cursor-help ${agent.open_count > 5 ? 'text-red-600' : agent.open_count > 2 ? 'text-amber-600' : 'text-surface-700'}`}>
                      {agent.open_count}
                    </span>
                  </Tip>
                </td>
                <td className="py-2 text-right text-surface-600">{agent.resolved_last_30d}</td>
                <td className="py-2 text-right text-surface-600">
                  {agent.overall_avg_hours > 0 ? (
                    <Tip
                      text={Object.keys(agent.avg_hours_by_category).length
                        ? Object.entries(agent.avg_hours_by_category).map(([cat, h]) => `${cat}: ${h}h`).join(' · ')
                        : 'No category breakdown available'}
                      position="left"
                    >
                      <span className="cursor-help border-b border-dashed border-surface-300">{agent.overall_avg_hours}h</span>
                    </Tip>
                  ) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  )
}

// ─── Auto-Classify Widget ─────────────────────────────────────────────────────

const PRIORITY_NAMES: Record<number, string> = { 0: 'Highly Critical', 1: 'Critical', 2: 'High', 3: 'Medium', 4: 'Low' }

function ClassifyWidget() {
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const classify = useClassifyIncident()

  return (
    <Panel title="Auto-Classify Incident" icon={Zap} badge={<span className="text-2xs text-violet-600 font-semibold bg-violet-50 px-1.5 py-0.5 rounded">AI</span>}>
      <p className="text-2xs text-surface-400 mb-3">Paste a ticket title and description — AI suggests priority and category.</p>
      <div className="flex flex-col gap-2">
        <input
          type="text"
          placeholder="Incident title…"
          value={title}
          onChange={e => setTitle(e.target.value)}
          className="border border-surface-200 bg-white text-xs px-2 py-1.5 focus:outline-none focus:border-surface-400 w-full"
          style={{ borderRadius: 2 }}
        />
        <textarea
          placeholder="Description (optional)…"
          value={desc}
          onChange={e => setDesc(e.target.value)}
          rows={3}
          className="border border-surface-200 bg-white text-xs px-2 py-1.5 focus:outline-none focus:border-surface-400 w-full resize-none"
          style={{ borderRadius: 2 }}
        />
        <button
          onClick={() => classify.mutate({ title, description: desc })}
          disabled={!title.trim() || classify.isPending}
          className="text-xs font-medium bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          style={{ height: 28, borderRadius: 2 }}
        >
          {classify.isPending ? 'Classifying…' : 'Classify'}
        </button>
        {classify.data && (
          <div className="border border-violet-200 bg-violet-50 px-3 py-2" style={{ borderRadius: 3 }}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-2xs font-semibold text-violet-700">Suggestion</span>
              <span className="text-2xs text-surface-500">{Math.round(classify.data.confidence * 100)}% confidence</span>
            </div>
            <div className="flex gap-2 mb-1">
              <span className="text-2xs bg-white border border-violet-200 text-violet-700 px-1.5 py-0.5 rounded font-medium">
                {PRIORITY_NAMES[classify.data.priority] ?? `P${classify.data.priority}`}
              </span>
              <span className="text-2xs bg-white border border-violet-200 text-violet-700 px-1.5 py-0.5 rounded font-medium">
                {classify.data.category}
              </span>
            </div>
            <p className="text-2xs text-surface-500 italic">{classify.data.reasoning}</p>
          </div>
        )}
        {classify.isError && (
          <p className="text-2xs text-red-600">Classification failed. Check AI settings.</p>
        )}
      </div>
    </Panel>
  )
}

// ─── SLA Breach Heatmap ───────────────────────────────────────────────────────

function breachCellBg(pct: number): string {
  if (pct === 0) return '#f0fdf4'
  if (pct < 20) return '#fef9c3'
  if (pct < 40) return '#fed7aa'
  if (pct < 65) return '#fca5a5'
  return '#ef4444'
}
function breachCellFg(pct: number): string {
  if (pct === 0) return '#16a34a'
  if (pct < 20) return '#854d0e'
  if (pct < 40) return '#c2410c'
  if (pct < 65) return '#991b1b'
  return '#ffffff'
}

function SLABreachHeatmapPanel() {
  const { data, isLoading } = useSLABreachHeatmap()
  const { data: priorities } = usePriorities()

  const categories = data ? [...new Set(data.map(d => d.category))].sort() : []
  const priorityCount = priorities?.length || 5
  const priorityNames = priorities?.map(p => p.name) || Array.from({ length: priorityCount }, (_, i) => `P${i}`)

  type HeatCell = { category: string; priority: number; total: number; breached: number; breach_pct: number }
  const cellMap = new Map<string, Map<number, HeatCell>>()
  for (const cell of data || []) {
    if (!cellMap.has(cell.category)) cellMap.set(cell.category, new Map())
    cellMap.get(cell.category)!.set(cell.priority, cell)
  }

  return (
    <Panel
      title="SLA Breach Rate — Category × Priority"
      icon={Shield}
      tooltip="Breach rate per category/priority combination over the last 90 days. Green = clean, red = high breach rate. Blank = no incidents in that combination."
    >
      {isLoading ? (
        <Sk h={120} />
      ) : !data?.length ? (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <Shield size={24} className="text-green-500 mb-2" />
          <p className="text-xs text-surface-500">No historical incident data yet</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="border-collapse w-full">
            <thead>
              <tr>
                <th className="text-left pb-2 text-2xs text-surface-400 font-medium" style={{ minWidth: 120, paddingRight: 12 }}>Category</th>
                {priorityNames.map((name, i) => (
                  <th key={i} className="pb-2 text-2xs text-surface-500 font-medium text-center" style={{ width: 72 }}>
                    {name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categories.map(cat => (
                <tr key={cat}>
                  <td className="py-0.5 text-xs text-surface-600 font-medium truncate" style={{ maxWidth: 140, paddingRight: 12 }}>{cat}</td>
                  {Array.from({ length: priorityCount }, (_, i) => {
                    const cell = cellMap.get(cat)?.get(i)
                    return (
                      <td key={i} className="py-0.5 px-1">
                        {cell ? (
                          <Tip text={`${cat} · ${priorityNames[i]}: ${cell.breached}/${cell.total} breached`}>
                            <div
                              className="flex items-center justify-center font-semibold cursor-help mx-auto"
                              style={{ width: 60, height: 28, background: breachCellBg(cell.breach_pct), color: breachCellFg(cell.breach_pct), borderRadius: 3, fontSize: 11 }}
                            >
                              {cell.breach_pct}%
                            </div>
                          </Tip>
                        ) : (
                          <div className="flex items-center justify-center text-surface-200 mx-auto" style={{ width: 60, height: 28, background: '#f8fafc', borderRadius: 3, fontSize: 11 }}>—</div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}

// ─── Peak Volume Heatmap ──────────────────────────────────────────────────────

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const HOUR_LABELS = ['12am–4am', '4–8am', '8am–12pm', '12–4pm', '4–8pm', '8pm–12am']

function peakBg(count: number, maxCount: number): string {
  if (!count || !maxCount) return '#f8fafc'
  const r = count / maxCount
  if (r < 0.2) return '#dbeafe'
  if (r < 0.45) return '#93c5fd'
  if (r < 0.7) return '#3b82f6'
  return '#1d4ed8'
}
function peakFg(count: number, maxCount: number): string {
  if (!count || !maxCount) return '#cbd5e1'
  return count / maxCount >= 0.45 ? '#ffffff' : '#1e40af'
}

function PeakVolumePanel() {
  const { data, isLoading } = usePeakVolume()

  const lookup: Record<number, Record<number, number>> = {}
  for (const cell of data?.cells || []) {
    if (!lookup[cell.day]) lookup[cell.day] = {}
    lookup[cell.day][cell.hour_bucket] = cell.count
  }
  const maxCount = data?.max_count || 0

  return (
    <Panel
      title="Peak Volume — Day × Hour"
      icon={TrendingUp}
      tooltip="Incident volume by day of week and 4-hour time slot over the last 90 days. Dark blue = busiest slots. Use this to align on-call coverage with actual demand."
    >
      {isLoading ? (
        <Sk h={140} />
      ) : !data?.cells.length ? (
        <p className="text-xs text-surface-400 py-6 text-center">No incident data yet</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="border-collapse w-full">
            <thead>
              <tr>
                <th style={{ width: 36 }} />
                {HOUR_LABELS.map((label, i) => (
                  <th key={i} className="pb-2 text-2xs text-surface-400 font-medium text-center" style={{ width: 80 }}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DAY_LABELS.map((day, d) => (
                <tr key={d}>
                  <td className="pr-2 py-0.5 text-xs text-surface-600 font-medium">{day}</td>
                  {Array.from({ length: 6 }, (_, hb) => {
                    const count = lookup[d]?.[hb] || 0
                    return (
                      <td key={hb} className="py-0.5 px-1">
                        <Tip text={`${day} ${HOUR_LABELS[hb]}: ${count} incident${count !== 1 ? 's' : ''}`}>
                          <div
                            className="flex items-center justify-center font-semibold cursor-help mx-auto"
                            style={{ width: 70, height: 28, background: peakBg(count, maxCount), color: peakFg(count, maxCount), borderRadius: 3, fontSize: 11 }}
                          >
                            {count || ''}
                          </div>
                        </Tip>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center gap-1.5 mt-3 justify-end">
            {[['#dbeafe','low'], ['#93c5fd','mid'], ['#3b82f6','high'], ['#1d4ed8','peak']].map(([bg, label]) => (
              <div key={label} className="flex items-center gap-1 text-2xs text-surface-400">
                <div style={{ width: 12, height: 12, background: bg, borderRadius: 2 }} />
                {label}
              </div>
            ))}
          </div>
        </div>
      )}
    </Panel>
  )
}

// ─── Reopen Rate ──────────────────────────────────────────────────────────────

function ReopenRatePanel() {
  const { data, isLoading } = useReopenRate()

  return (
    <Panel
      title="Reopen Rate by Category"
      icon={AlertTriangle}
      tooltip="Categories where the most resolved tickets are later reopened. High reopen rate = resolutions that don't stick — often a symptom of root-cause misdiagnosis or premature closure."
    >
      {isLoading ? (
        <div className="flex flex-col gap-2">{[...Array(4)].map((_, i) => <Sk key={i} h={24} />)}</div>
      ) : !data?.length ? (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <Shield size={24} className="text-green-500 mb-2" />
          <p className="text-xs text-surface-500">No resolved incidents yet</p>
        </div>
      ) : (
        <div>
          <div className="flex text-2xs text-surface-400 font-medium pb-1.5 border-b border-surface-100 mb-1">
            <span className="flex-1">Category</span>
            <span className="w-16 text-right">Resolved</span>
            <span className="w-16 text-right">Reopened</span>
            <span className="w-12 text-right">Rate</span>
          </div>
          {data.map(row => (
            <div key={row.category} className="flex items-center py-1 border-b border-surface-50 last:border-0">
              <span className="flex-1 text-xs text-surface-700 truncate">{row.category}</span>
              <span className="w-16 text-right text-2xs text-surface-400">{row.total_resolved}</span>
              <span className="w-16 text-right text-2xs text-surface-400">{row.reopened}</span>
              <span
                className="w-12 text-right text-2xs font-semibold"
                style={{ color: row.reopen_pct >= 15 ? '#b91c1c' : row.reopen_pct >= 8 ? '#c2410c' : row.reopen_pct > 0 ? '#a16207' : '#16a34a' }}
              >
                {row.reopen_pct}%
              </span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}

// ─── Resolution Time ──────────────────────────────────────────────────────────

function resTimeColor(hours: number): string {
  if (hours <= 4) return '#16a34a'
  if (hours <= 12) return '#a16207'
  if (hours <= 48) return '#c2410c'
  return '#b91c1c'
}

function ResolutionTimePanel() {
  const { data, isLoading } = useResolutionTime()
  const maxAvg = data?.length ? Math.max(...data.map(d => d.avg_hours), 1) : 1

  return (
    <Panel
      title="Avg Resolution Time by Category"
      icon={Zap}
      tooltip="Average hours from incident creation to resolution per category over the last 90 days. P50 is the median. Hover the label for P50. Long bars = categories that drain the most time."
    >
      {isLoading ? (
        <div className="flex flex-col gap-2">{[...Array(4)].map((_, i) => <Sk key={i} h={28} />)}</div>
      ) : !data?.length ? (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <Shield size={24} className="text-green-500 mb-2" />
          <p className="text-xs text-surface-500">No resolved incidents yet</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {data.map(row => (
            <div key={row.category}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-surface-700 truncate flex-1 mr-2">{row.category}</span>
                <div className="flex items-center gap-2 flex-none">
                  <span className="text-2xs text-surface-400">{row.count} tickets</span>
                  <Tip text={`Avg: ${row.avg_hours}h · P50: ${row.p50_hours}h`} position="left">
                    <span className="text-2xs font-semibold cursor-help" style={{ color: resTimeColor(row.avg_hours) }}>
                      {row.avg_hours}h
                    </span>
                  </Tip>
                </div>
              </div>
              <div className="bg-surface-100 overflow-hidden" style={{ height: 5, borderRadius: 9999 }}>
                <div
                  style={{
                    width: `${Math.min(row.avg_hours / maxAvg * 100, 100)}%`,
                    height: '100%',
                    background: resTimeColor(row.avg_hours),
                    borderRadius: 9999,
                    transition: 'width 0.4s',
                  }}
                />
              </div>
            </div>
          ))}
          <div className="flex gap-4 mt-1 justify-end">
            {[['#16a34a', '≤4h'], ['#a16207', '≤12h'], ['#c2410c', '≤48h'], ['#b91c1c', '>48h']].map(([color, label]) => (
              <div key={label} className="flex items-center gap-1 text-2xs text-surface-400">
                <div style={{ width: 8, height: 8, borderRadius: 9999, background: color }} />
                {label}
              </div>
            ))}
          </div>
        </div>
      )}
    </Panel>
  )
}

// ─── Ops Summary ─────────────────────────────────────────────────────────────

function OpsSummaryPanel({ aiEnabled, isAgent }: { aiEnabled: boolean; isAgent: boolean }) {
  const summary = useOpsSummary()

  return (
    <Panel
      title="Weekly Ops Summary"
      icon={Brain}
      tooltip="One AI call that reads your full operational state — open incidents, SLA compliance, anomalies, resolution trends — and writes a brief actionable briefing. Manual trigger only, not automatic."
      badge={<span className="text-2xs text-violet-600 font-semibold bg-violet-50 px-1.5 py-0.5 border border-violet-200" style={{ borderRadius: 3 }}>AI</span>}
    >
      {summary.data ? (
        <div>
          <p className="text-sm text-surface-700 leading-relaxed whitespace-pre-wrap">{summary.data.summary}</p>
          <button
            onClick={() => summary.reset()}
            className="mt-3 text-2xs text-surface-400 hover:text-surface-600 transition-colors"
          >
            Clear
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-start gap-3">
          <p className="text-2xs text-surface-400 max-w-xl">
            Compiles open incidents, SLA compliance, anomaly signals, and 14-day volume trends into a single AI-written briefing.
            One call per generation — not automatic, not per page load.
          </p>
          {!aiEnabled && (
            <p className="text-2xs text-amber-600">Enable AI in Settings to use this feature.</p>
          )}
          {!isAgent && aiEnabled && (
            <p className="text-2xs text-surface-400">Available to agents and admins.</p>
          )}
          {summary.isError && (
            <p className="text-2xs text-red-600">Failed to generate. Check AI settings.</p>
          )}
          {aiEnabled && isAgent && (
            <button
              onClick={() => summary.mutate()}
              disabled={summary.isPending}
              className="text-xs font-medium bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed px-3 transition-colors"
              style={{ height: 28, borderRadius: 2 }}
            >
              {summary.isPending ? 'Generating…' : 'Generate ops summary'}
            </button>
          )}
        </div>
      )}
    </Panel>
  )
}

// ─── Similar Incidents info ───────────────────────────────────────────────────

function SimilarIncidentsInfo() {
  return (
    <Panel title="Similar Incidents" icon={Brain} badge={<span className="text-2xs text-violet-600 font-semibold bg-violet-50 px-1.5 py-0.5 rounded">AI</span>}>
      <div className="flex flex-col items-center justify-center py-4 text-center gap-3">
        <Brain size={28} className="text-violet-400" />
        <div>
          <p className="text-xs font-medium text-surface-700">Available on each incident</p>
          <p className="text-2xs text-surface-400 mt-1 max-w-xs">
            Open any incident and the AI will surface the 3 most similar resolved tickets — including how they were fixed.
          </p>
        </div>
        <Link to="/incidents" className="text-2xs text-violet-600 font-medium hover:underline">
          Browse incidents →
        </Link>
      </div>
    </Panel>
  )
}

// ─── AI Disabled Banner ───────────────────────────────────────────────────────

function AIDisabledBanner({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className="border border-surface-200 bg-surface-50 px-4 py-6 flex items-center gap-4" style={{ borderRadius: 4 }}>
      <Lock size={20} className="text-surface-400 flex-none" />
      <div>
        <p className="text-sm font-medium text-surface-600">AI features are disabled</p>
        <p className="text-xs text-surface-400 mt-0.5">
          {isAdmin
            ? 'Enable AI in Settings → General → AI & Automation to unlock auto-classify, similar incidents, and agent suggestions.'
            : 'Contact an administrator to enable AI features.'}
        </p>
      </div>
    </div>
  )
}

// ─── Master Toggle ────────────────────────────────────────────────────────────

function AIToggle({ enabled }: { enabled: boolean }) {
  const patch = usePatchAISettings()
  return (
    <button
      onClick={() => patch.mutate({ ai_enabled: enabled ? 0 : 1 })}
      disabled={patch.isPending}
      className={`relative inline-flex items-center transition-colors disabled:opacity-50 ${enabled ? 'bg-violet-600' : 'bg-surface-300'}`}
      style={{ width: 36, height: 20, borderRadius: 10 }}
      title={enabled ? 'Disable AI' : 'Enable AI'}
    >
      <span
        className="absolute bg-white transition-transform"
        style={{
          width: 14, height: 14, borderRadius: '50%', left: 3,
          transform: enabled ? 'translateX(16px)' : 'translateX(0)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }}
      />
    </button>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PredictiveAnalytics() {
  const { data: aiStatus } = useAIStatus()
  const { data: me } = useMe()
  const isAdmin = me?.scopes?.includes('Admin') ?? false
  const isAgent = me?.scopes?.includes('Agent') ?? false
  const aiEnabled = aiStatus?.ai_enabled ?? false

  return (
    <div style={{ padding: 24, overflowY: 'auto', height: '100%' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-base font-semibold text-surface-800">Predictive Analytics</h1>
          <p className="text-xs text-surface-400 mt-0.5">Operational intelligence and AI-powered insights</p>
        </div>
        <div className="flex items-center gap-3">
          <AIBadge enabled={aiEnabled} />
          {isAdmin && (
            <div className="flex items-center gap-2">
              <span className="text-2xs text-surface-500">AI</span>
              <AIToggle enabled={aiEnabled} />
            </div>
          )}
        </div>
      </div>

      {/* Real-time: SLA Risk + Anomaly Detection */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <SLARiskPanel />
        <AnomalyPanel />
      </div>

      {/* Forecast */}
      <div className="mb-4">
        <ForecastPanel />
      </div>

      {/* Historical patterns section */}
      <div className="border-t border-surface-200 pt-5 mb-5">
        <span className="text-2xs font-semibold text-surface-400 uppercase tracking-widest">Historical Patterns</span>
      </div>

      {/* SLA Breach Heatmap */}
      <div className="mb-4">
        <SLABreachHeatmapPanel />
      </div>

      {/* Peak Volume Heatmap */}
      <div className="mb-4">
        <PeakVolumePanel />
      </div>

      {/* Reopen Rate + Resolution Time */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <ReopenRatePanel />
        <ResolutionTimePanel />
      </div>

      {/* Agent Workload */}
      <div className="mb-6">
        <AgentWorkloadPanel />
      </div>

      {/* AI-powered section */}
      <div className="border-t border-surface-200 pt-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-2xs font-semibold text-surface-400 uppercase tracking-widest">
            AI-Powered Features
          </span>
          <span className="bg-violet-100 text-violet-700 border border-violet-200 text-2xs px-2 py-0.5 font-semibold" style={{ borderRadius: 10 }}>
            BETA
          </span>
        </div>
        {!aiEnabled ? (
          <AIDisabledBanner isAdmin={isAdmin} />
        ) : (
          <div className="flex flex-col gap-4">
            <OpsSummaryPanel aiEnabled={aiEnabled} isAgent={isAgent || isAdmin} />
            <div className="grid grid-cols-2 gap-4">
              <ClassifyWidget />
              <SimilarIncidentsInfo />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
