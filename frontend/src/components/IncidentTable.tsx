import { useNavigate } from 'react-router-dom'
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import { PriorityBadge } from './PriorityBadge'
import { StateBadge } from './StateBadge'
import { relativeTime } from '@/utils/relativeTime'
import type { IncidentListItem } from '@/types'
import type { Priority } from '@/types'

const COL_HEADERS: { key: string; label: string; sortable: boolean; width: number | string; align?: string }[] = [
  { key: 'checkbox', label: '', sortable: false, width: 32 },
  { key: 'number',   label: 'Number',      sortable: true,  width: 110 },
  { key: 'priority', label: 'Priority',    sortable: true,  width: 88 },
  { key: 'state',    label: 'State',       sortable: false, width: 108 },
  { key: 'title',    label: 'Short Description', sortable: false, width: 'auto' },
  { key: 'category', label: 'Category',   sortable: false, width: 140 },
  { key: 'assignee', label: 'Assigned To', sortable: false, width: 150 },
  { key: 'updated',  label: 'Updated',    sortable: true,  width: 90, align: 'right' },
]

interface Props {
  items: IncidentListItem[]
  priorities: Priority[]
  sort: string
  order: 'asc' | 'desc'
  onSort: (col: string, order: 'asc' | 'desc') => void
  isLoading: boolean
}

export function IncidentTable({ items, priorities, sort, order, onSort, isLoading }: Props) {
  const navigate = useNavigate()

  function handleSort(colKey: string) {
    if (sort === colKey) {
      onSort(colKey, order === 'asc' ? 'desc' : 'asc')
    } else {
      onSort(colKey, 'desc')
    }
  }

  function SortIcon({ col }: { col: string }) {
    if (sort !== col) return <ChevronsUpDown size={11} className="text-surface-400 opacity-0 group-hover:opacity-100" />
    return order === 'asc'
      ? <ChevronUp size={11} className="text-surface-600" />
      : <ChevronDown size={11} className="text-surface-600" />
  }

  return (
    <div style={{ position: 'relative' }}>
      {/* Loading progress bar */}
      {isLoading && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 2, zIndex: 10,
          background: 'linear-gradient(90deg, #e2e8f0 0%, #3b82f6 50%, #e2e8f0 100%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 1.2s infinite',
        }} />
      )}

      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          tableLayout: 'fixed',
          fontSize: 13,
        }}
      >
        <colgroup>
          {COL_HEADERS.map(c => (
            <col key={c.key} style={{ width: c.width === 'auto' ? undefined : c.width }} />
          ))}
        </colgroup>

        {/* Header */}
        <thead>
          <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', height: 32 }}>
            {COL_HEADERS.map(col => (
              <th
                key={col.key}
                className={`group px-2 text-left ${col.align === 'right' ? 'text-right' : ''}`}
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  color: '#64748b',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  userSelect: 'none',
                  cursor: col.sortable ? 'pointer' : 'default',
                  whiteSpace: 'nowrap',
                  paddingLeft: col.key === 'checkbox' ? 8 : undefined,
                  paddingRight: col.key === 'checkbox' ? 0 : undefined,
                }}
                onClick={() => col.sortable && handleSort(col.key === 'updated' ? 'updated_at' : col.key === 'number' ? 'number' : col.key)}
              >
                {col.key === 'checkbox' ? null : (
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {col.sortable && (
                      <SortIcon col={col.key === 'updated' ? 'updated_at' : col.key} />
                    )}
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>

        {/* Body */}
        <tbody>
          {items.length === 0 && !isLoading && (
            <tr>
              <td colSpan={COL_HEADERS.length} style={{ padding: '24px 12px', textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
                No incidents match these filters.
              </td>
            </tr>
          )}
          {items.map(inc => (
            <tr
              key={inc.id}
              onClick={() => navigate(`/incidents/${inc.id}`)}
              style={{
                height: 32,
                borderBottom: '1px solid #f1f5f9',
                cursor: 'pointer',
              }}
              className="hover:bg-surface-50 group/row"
            >
              {/* Checkbox */}
              <td
                style={{ paddingLeft: 8, paddingRight: 0, width: 32 }}
                onClick={e => e.stopPropagation()}
              >
                <input
                  type="checkbox"
                  className="w-3 h-3 border-surface-300 text-surface-600 rounded-none"
                  style={{ borderRadius: 2 }}
                />
              </td>

              {/* Number */}
              <td className="px-2 truncate" style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, color: '#475569', fontWeight: 500 }}>
                {inc.number}
              </td>

              {/* Priority */}
              <td className="px-2">
                <PriorityBadge priority={inc.priority as 1|2|3|4} priorities={priorities} />
              </td>

              {/* State */}
              <td className="px-2">
                <StateBadge state={inc.state} />
              </td>

              {/* Title */}
              <td className="px-2" style={{ color: '#1e293b', overflow: 'hidden' }}>
                <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {inc.sla_breached && (
                    <span style={{ color: '#b91c1c', fontWeight: 700, marginRight: 4, fontSize: 11 }}>!</span>
                  )}
                  {inc.title}
                </span>
              </td>

              {/* Category */}
              <td className="px-2 truncate" style={{ color: '#475569', fontSize: 12 }}>
                {inc.category}
              </td>

              {/* Assignee */}
              <td className="px-2 truncate" style={{ color: inc.assignee_id ? '#475569' : '#94a3b8', fontSize: 12 }}>
                {inc.assignee_id ? inc.assignee_id.substring(0, 8) + '…' : '—'}
              </td>

              {/* Updated */}
              <td className="px-2" style={{ color: '#94a3b8', fontSize: 11, textAlign: 'right', whiteSpace: 'nowrap' }}>
                {relativeTime(inc.updated_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>
    </div>
  )
}
