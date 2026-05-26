import { X } from 'lucide-react'

interface Props {
  label: string
  value: string
  onRemove: () => void
}

export function FilterPill({ label, value, onRemove }: Props) {
  return (
    <span
      className="inline-flex items-center gap-1 border border-surface-300 bg-surface-100 text-surface-700"
      style={{ height: 22, padding: '0 6px 0 8px', borderRadius: 4, fontSize: 11, whiteSpace: 'nowrap' }}
    >
      <span className="text-surface-500 font-medium">{label}:</span>
      <span>{value}</span>
      <button
        onClick={onRemove}
        className="flex items-center text-surface-400 hover:text-surface-700 ml-0.5"
        style={{ lineHeight: 1 }}
        aria-label={`Remove ${label} filter`}
      >
        <X size={11} strokeWidth={2.5} />
      </button>
    </span>
  )
}
