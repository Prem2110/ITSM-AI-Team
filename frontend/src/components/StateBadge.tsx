const STATE_STYLES: Record<string, { bg: string; border: string; text: string; label: string }> = {
  new:         { bg: 'rgba(37,99,235,0.10)',  border: 'rgba(37,99,235,0.28)',  text: '#1d4ed8', label: 'New' },
  assigned:    { bg: 'rgba(109,40,217,0.10)', border: 'rgba(109,40,217,0.28)', text: '#7c3aed', label: 'Assigned' },
  in_progress: { bg: 'rgba(202,138,4,0.10)',  border: 'rgba(202,138,4,0.28)',  text: '#a16207', label: 'In Progress' },
  on_hold:     { bg: 'rgba(100,116,139,0.10)',border: 'rgba(100,116,139,0.28)',text: '#475569', label: 'On Hold' },
  resolved:    { bg: 'rgba(22,163,74,0.10)',  border: 'rgba(22,163,74,0.28)',  text: '#15803d', label: 'Resolved' },
  closed:      { bg: 'rgba(71,85,105,0.10)',  border: 'rgba(71,85,105,0.28)',  text: '#334155', label: 'Closed' },
}

interface Props {
  state: string
}

export function StateBadge({ state }: Props) {
  const s = STATE_STYLES[state] ?? { bg: 'rgba(100,116,139,0.10)', border: 'rgba(100,116,139,0.28)', text: '#475569', label: state }
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
        background: s.bg,
        border: `1px solid ${s.border}`,
        color: s.text,
        whiteSpace: 'nowrap',
      }}
    >
      {s.label}
    </span>
  )
}
