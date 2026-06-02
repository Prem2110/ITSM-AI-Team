import { useEffect, useRef, useState, useCallback } from 'react'
import { getFakeUser } from '@/api/auth'

export interface PresenceUser {
  user_id: string
  name: string
  color: string
  editing_field: string | null
}

interface UseCollaborationResult {
  presence: PresenceUser[]
  isConnected: boolean
  lockField: (field: string) => void
  unlockField: (field: string) => void
  lockedBy: (field: string) => PresenceUser | null
}

export function useCollaboration(incidentId: string, myUserId: string | null | undefined): UseCollaborationResult {
  const [presence, setPresence] = useState<PresenceUser[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!myUserId) return
    const email = getFakeUser()
    if (!email) return

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const url = `${protocol}://${window.location.host}/api/incidents/${incidentId}/collaboration?email=${encodeURIComponent(email)}`

    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => setIsConnected(true)
    ws.onclose = () => {
      setIsConnected(false)
      setPresence([])
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string)
        setPresence(prev => {
          switch (msg.type as string) {
            case 'presence':
              return (msg.users as PresenceUser[]).filter((u: PresenceUser) => u.user_id !== myUserId)

            case 'join':
              if (msg.user_id === myUserId) return prev
              if (prev.some(u => u.user_id === msg.user_id)) return prev
              return [...prev, { user_id: msg.user_id, name: msg.name, color: msg.color, editing_field: null }]

            case 'leave':
              return prev.filter(u => u.user_id !== msg.user_id)

            case 'field_lock':
              return prev.map(u => u.user_id === msg.user_id ? { ...u, editing_field: msg.field as string } : u)

            case 'field_unlock':
              return prev.map(u => u.user_id === msg.user_id ? { ...u, editing_field: null } : u)

            default:
              return prev
          }
        })
      } catch {
        // ignore malformed messages
      }
    }

    return () => {
      ws.close()
      wsRef.current = null
    }
  }, [incidentId, myUserId])

  const lockField = useCallback((field: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'field_lock', field }))
    }
  }, [])

  const unlockField = useCallback((field: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'field_unlock', field }))
    }
  }, [])

  const lockedBy = useCallback((field: string): PresenceUser | null => {
    return presence.find(u => u.editing_field === field) ?? null
  }, [presence])

  return { presence, isConnected, lockField, unlockField, lockedBy }
}
