import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft } from 'lucide-react'
import { useMe, usePriorities, useCategories, useUsers } from '@/hooks'
import { createIncident } from '@/api/incidents'
import type { IncidentCreateRequest } from '@/types'

export default function IncidentNew() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: me } = useMe()
  const { data: priorities } = usePriorities()
  const { data: categories } = useCategories()

  const isAgent = me?.scopes?.includes('Agent') ?? false
  const { data: allUsers } = useUsers(undefined, isAgent)
  const agentUsers = allUsers?.filter(u => u.role !== 'requester') ?? []

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState(3)
  const [category, setCategory] = useState('')
  const [source, setSource] = useState('web')
  const [assigneeId, setAssigneeId] = useState('')
  const [requesterId, setRequesterId] = useState('')

  const createMut = useMutation({
    mutationFn: (payload: IncidentCreateRequest) => createIncident(payload),
    onSuccess: incident => {
      qc.invalidateQueries({ queryKey: ['incidents'] })
      navigate(`/incidents/${incident.id}`)
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !category) return
    createMut.mutate({
      title: title.trim(),
      description: description.trim(),
      priority,
      category,
      source,
      assignee_id: assigneeId || null,
      requester_id: requesterId || null,
    })
  }

  const canSubmit = title.trim().length > 0 && category !== '' && !createMut.isPending

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div
        className="flex-none flex items-center gap-3 px-4 bg-white border-b border-surface-200"
        style={{ height: 44 }}
      >
        <button
          onClick={() => navigate('/incidents')}
          className="flex items-center gap-1 text-xs text-surface-500 hover:text-surface-700 transition-colors"
        >
          <ChevronLeft size={14} />
          Incidents
        </button>
        <span className="text-surface-300">|</span>
        <span className="text-sm font-semibold text-surface-900">New Incident</span>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto px-5 py-5">
        <form onSubmit={handleSubmit} style={{ maxWidth: 640 }}>
          {/* Title */}
          <div className="mb-4">
            <label className="text-2xs font-semibold text-surface-400 uppercase tracking-wider mb-1 block">
              Title <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Brief description of the issue…"
              className="w-full text-xs border border-surface-200 bg-white px-2 py-1.5 focus:outline-none focus:border-surface-500"
              style={{ borderRadius: 2 }}
              autoFocus
              required
            />
          </div>

          {/* Description */}
          <div className="mb-4">
            <label className="text-2xs font-semibold text-surface-400 uppercase tracking-wider mb-1 block">
              Description
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={5}
              placeholder="Detailed description, steps to reproduce, impact…"
              className="w-full text-xs border border-surface-200 bg-white px-2 py-1.5 focus:outline-none focus:border-surface-500 resize-none"
              style={{ borderRadius: 2 }}
            />
          </div>

          {/* Priority + Category */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-2xs font-semibold text-surface-400 uppercase tracking-wider mb-1 block">
                Priority
              </label>
              <select
                value={priority}
                onChange={e => setPriority(Number(e.target.value))}
                className="w-full text-xs border border-surface-200 bg-white px-2 py-1.5 focus:outline-none focus:border-surface-500"
                style={{ borderRadius: 2 }}
              >
                {priorities?.map(p => (
                  <option key={p.level} value={p.level}>{p.name}</option>
                )) ?? [1, 2, 3, 4].map(n => <option key={n} value={n}>P{n}</option>)}
              </select>
            </div>
            <div>
              <label className="text-2xs font-semibold text-surface-400 uppercase tracking-wider mb-1 block">
                Category <span className="text-red-400">*</span>
              </label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full text-xs border border-surface-200 bg-white px-2 py-1.5 focus:outline-none focus:border-surface-500"
                style={{ borderRadius: 2 }}
                required
              >
                <option value="">Select category…</option>
                {categories?.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Source */}
          <div className="mb-4" style={{ maxWidth: 300 }}>
            <label className="text-2xs font-semibold text-surface-400 uppercase tracking-wider mb-1 block">
              Source
            </label>
            <select
              value={source}
              onChange={e => setSource(e.target.value)}
              className="w-full text-xs border border-surface-200 bg-white px-2 py-1.5 focus:outline-none focus:border-surface-500"
              style={{ borderRadius: 2 }}
            >
              <option value="web">Web Portal</option>
              <option value="email">Email</option>
              <option value="classifier_escalation">Auto-Classifier</option>
              <option value="fix_failed_escalation">Fix Failed Escalation</option>
            </select>
          </div>

          {/* Agent-only: Assignee + Requester */}
          {isAgent && (
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-2xs font-semibold text-surface-400 uppercase tracking-wider mb-1 block">
                  Assign To
                </label>
                <select
                  value={assigneeId}
                  onChange={e => setAssigneeId(e.target.value)}
                  className="w-full text-xs border border-surface-200 bg-white px-2 py-1.5 focus:outline-none focus:border-surface-500"
                  style={{ borderRadius: 2 }}
                >
                  <option value="">Unassigned</option>
                  {agentUsers.map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-2xs font-semibold text-surface-400 uppercase tracking-wider mb-1 block">
                  Requester
                </label>
                <select
                  value={requesterId}
                  onChange={e => setRequesterId(e.target.value)}
                  className="w-full text-xs border border-surface-200 bg-white px-2 py-1.5 focus:outline-none focus:border-surface-500"
                  style={{ borderRadius: 2 }}
                >
                  <option value="">Me ({me?.name})</option>
                  {allUsers?.map(u => (
                    <option key={u.id} value={u.id}>{u.name} · {u.role}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Error */}
          {createMut.isError && (
            <div
              className="mb-4 text-xs text-red-700 border border-red-200 bg-red-50 px-3 py-2"
              style={{ borderRadius: 2 }}
            >
              {String(
                (createMut.error as any)?.response?.data?.detail ??
                (createMut.error as Error)?.message ??
                'Failed to create incident'
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={!canSubmit}
              className="text-xs font-medium px-4 py-1.5 bg-surface-800 text-white hover:bg-surface-700 disabled:opacity-40 transition-colors"
              style={{ borderRadius: 2 }}
            >
              {createMut.isPending ? 'Creating…' : 'Create Incident'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/incidents')}
              className="text-xs text-surface-500 hover:text-surface-700"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
