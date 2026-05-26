import { Plus } from 'lucide-react'

interface Props {
  count: number
  isLoading: boolean
  onNew: () => void
}

export function Toolbar({ count, isLoading, onNew }: Props) {
  return (
    <div
      className="flex-none flex items-center gap-3 px-3 border-b border-surface-200 bg-white"
      style={{ height: 40 }}
    >
      <span className="text-sm font-semibold text-surface-800">Incidents</span>
      <span className="text-xs text-surface-400">
        {isLoading ? '…' : `${count.toLocaleString()} record${count !== 1 ? 's' : ''}`}
      </span>
      <div className="flex-1" />
      <button
        onClick={onNew}
        className="inline-flex items-center gap-1.5 bg-surface-800 text-white hover:bg-surface-700 text-xs font-medium transition-colors"
        style={{ height: 28, padding: '0 10px', borderRadius: 4 }}
      >
        <Plus size={13} strokeWidth={2.5} />
        New Incident
      </button>
    </div>
  )
}
