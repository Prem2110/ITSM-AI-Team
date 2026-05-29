import { Navigate } from 'react-router-dom'
import { isAuthenticated } from '@/api/auth'
import { useSetupStatus } from '@/hooks/useSetupStatus'
import { FourSquareLoader } from '@/components/Skeleton'

export function RequireAuth({ children }: { children: React.ReactNode }) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}

export function RequireSetup({ children }: { children: React.ReactNode }) {
  const { data, isLoading } = useSetupStatus()
  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface-50 flex items-center justify-center">
        <FourSquareLoader size={56} color="#94a3b8" />
      </div>
    )
  }
  if (data && !data.completed) {
    return <Navigate to="/setup" replace />
  }
  return <>{children}</>
}
