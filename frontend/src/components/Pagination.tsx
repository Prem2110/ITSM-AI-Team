import { ChevronLeft, ChevronRight } from 'lucide-react'

interface Props {
  page: number
  total: number
  pageSize: number
  onPage: (p: number) => void
}

export function Pagination({ page, total, pageSize, onPage }: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)

  if (total === 0) return null

  return (
    <div
      className="flex-none flex items-center justify-end gap-2 px-3 border-t border-surface-200 bg-white"
      style={{ height: 32 }}
    >
      <span className="text-xs text-surface-500">
        {start}–{end} of {total.toLocaleString()}
      </span>
      <div className="flex items-center gap-1">
        <button
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className="flex items-center justify-center border border-surface-200 text-surface-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-50 transition-colors"
          style={{ width: 24, height: 24, borderRadius: 2 }}
          aria-label="Previous page"
        >
          <ChevronLeft size={13} />
        </button>
        <button
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
          className="flex items-center justify-center border border-surface-200 text-surface-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-50 transition-colors"
          style={{ width: 24, height: 24, borderRadius: 2 }}
          aria-label="Next page"
        >
          <ChevronRight size={13} />
        </button>
      </div>
    </div>
  )
}
