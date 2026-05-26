import type { Priority } from '@/types'

// Hardcoded colors — config `color` field is a name ("red") not hex
const PRIORITY_STYLES: Record<number, { bg: string; border: string; text: string }> = {
  1: { bg: 'rgba(220,38,38,0.10)', border: 'rgba(220,38,38,0.28)', text: '#b91c1c' },
  2: { bg: 'rgba(234,88,12,0.10)', border: 'rgba(234,88,12,0.28)', text: '#c2410c' },
  3: { bg: 'rgba(202,138,4,0.10)', border: 'rgba(202,138,4,0.28)',  text: '#a16207' },
  4: { bg: 'rgba(22,163,74,0.10)',  border: 'rgba(22,163,74,0.28)',  text: '#15803d' },
}

interface Props {
  priority: number
  priorities?: Priority[]
}

export function PriorityBadge({ priority, priorities }: Props) {
  const style = PRIORITY_STYLES[priority] ?? PRIORITY_STYLES[4]
  const label = priorities?.find(p => p.level === priority)?.name ?? `P${priority}`
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 20,
        padding: '1px 6px',
        borderRadius: '3px',
        fontSize: 11,
        fontWeight: 600,
        lineHeight: 1,
        background: style.bg,
        border: `1px solid ${style.border}`,
        color: style.text,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  )
}
