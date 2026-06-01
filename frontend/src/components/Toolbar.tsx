import type { ReactNode } from 'react'
import { Plus } from 'lucide-react'

interface Props {
  count: number
  isLoading: boolean
  onNew: () => void
  actions?: ReactNode
}

export function Toolbar({ count, isLoading, onNew, actions }: Props) {
  return (
    <div
      className="flex-none flex items-center border-b border-surface-200 bg-white"
      style={{ height: 40, paddingLeft: 16, paddingRight: 16, gap: 12 }}
    >
      {/* Title + count share a baseline */}
      <div className="flex items-baseline" style={{ gap: 8 }}>
        <span className="font-semibold text-surface-800" style={{ fontSize: 15 }}>Incidents</span>
        <span className="text-surface-500" style={{ fontSize: 12 }}>
          {isLoading ? '…' : `${count.toLocaleString()} record${count !== 1 ? 's' : ''}`}
        </span>
      </div>
      <div className="flex-1" />
      {actions && <div className="inline-flex items-center" style={{ gap: 8 }}>{actions}</div>}
      <button
        onClick={onNew}
        className="inline-flex items-center gap-1 bg-surface-700 text-white hover:bg-surface-800 font-medium transition-colors"
        style={{ height: 28, padding: '0 10px', borderRadius: 4, fontSize: 12 }}
      >
        <Plus size={12} strokeWidth={2.5} />
        New Incident
      </button>
    </div>
  )
}
