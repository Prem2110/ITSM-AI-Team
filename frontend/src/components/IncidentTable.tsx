import { useNavigate } from 'react-router-dom'
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { PriorityBadge } from './PriorityBadge'
import { StateBadge } from './StateBadge'
import { relativeTime } from '@/utils/relativeTime'
import type { IncidentListItem } from '@/types'
import type { Priority } from '@/types'

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
  const { t } = useTranslation()

  const COL_HEADERS: { key: string; label: string; sortable: boolean; width: number | string; align?: string }[] = [
    { key: 'checkbox',  label: '',                          sortable: false, width: 32 },
    { key: 'number',    label: t('incidents.number'),       sortable: true,  width: 110 },
    { key: 'priority',  label: t('incidents.priority'),     sortable: true,  width: 88 },
    { key: 'state',     label: t('incidents.state'),        sortable: false, width: 108 },
    { key: 'title',     label: t('incidents.shortDescription'), sortable: false, width: 'auto' },
    { key: 'category',  label: t('incidents.category'),     sortable: false, width: 140 },
    { key: 'assignee',  label: t('incidents.assignedTo'),   sortable: false, width: 150 },
    { key: 'updated',   label: t('incidents.updated'),      sortable: true,  width: 90, align: 'right' },
  ]

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
          background: 'linear-gradient(90deg, var(--border-color) 0%, #3b82f6 50%, var(--border-color) 100%)',
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
          <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', height: 32 }}>
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
              <td colSpan={COL_HEADERS.length} style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--text-subtle)', fontSize: 12 }}>
                {t('incidents.noMatch')}
              </td>
            </tr>
          )}
          {items.map((inc, i) => (
            <tr
              key={inc.id}
              onClick={() => navigate(`/incidents/${inc.id}`)}
              style={{
                height: 32,
                borderBottom: '1px solid var(--border-subtle)',
                cursor: 'pointer',
                animationDelay: `${Math.min(i * 25, 200)}ms`,
              }}
              className="hover:bg-surface-50 group/row animate-row-enter"
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
              <td className="px-2 truncate" style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>
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
              <td className="px-2" style={{ color: 'var(--text-primary)', overflow: 'hidden' }}>
                <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {inc.sla_breached && (
                    <span style={{ color: '#b91c1c', fontWeight: 700, marginRight: 4, fontSize: 11 }}>!</span>
                  )}
                  {inc.title}
                </span>
              </td>

              {/* Category */}
              <td className="px-2 truncate" style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                {inc.category}
              </td>

              {/* Assignee */}
              <td className="px-2 truncate" style={{ color: inc.assignee_name ? 'var(--text-secondary)' : 'var(--text-subtle)', fontSize: 12 }}>
                {inc.assignee_name ?? '—'}
              </td>

              {/* Updated */}
              <td className="px-2" style={{ color: 'var(--text-subtle)', fontSize: 11, textAlign: 'right', whiteSpace: 'nowrap' }}>
                {relativeTime(inc.updated_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

    </div>
  )
}
