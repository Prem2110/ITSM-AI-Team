import { createBrowserRouter, Navigate } from 'react-router-dom'
import { isAuthenticated } from '@/api/auth'
import { useSetupStatus } from '@/hooks/useSetupStatus'
import Layout from '@/components/Layout'
import Login from '@/pages/Login'
import Incidents from '@/pages/Incidents'
import IncidentNew from '@/pages/IncidentNew'
import IncidentDetail from '@/pages/IncidentDetail'
import Dashboard from '@/pages/Dashboard'
import AppearanceSettings from '@/pages/Settings'
import AppSettings from '@/pages/AppSettings'
import Setup from '@/pages/Setup'

function RequireAuth({ children }: { children: React.ReactNode }) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}

function RequireSetup({ children }: { children: React.ReactNode }) {
  const { data, isLoading } = useSetupStatus()
  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface-100 flex items-center justify-center">
        <span className="text-xs text-surface-400">Loading…</span>
      </div>
    )
  }
  if (data && !data.completed) {
    return <Navigate to="/setup" replace />
  }
  return <>{children}</>
}

export const router = createBrowserRouter([
  { path: '/setup', element: <Setup /> },
  {
    path: '/login',
    element: (
      <RequireSetup>
        <Login />
      </RequireSetup>
    ),
  },
  {
    path: '/',
    element: (
      <RequireSetup>
        <RequireAuth>
          <Layout />
        </RequireAuth>
      </RequireSetup>
    ),
    children: [
      { index: true, element: <Navigate to="/incidents" replace /> },
      { path: 'incidents', element: <Incidents /> },
      { path: 'incidents/new', element: <IncidentNew /> },
      { path: 'incidents/:id', element: <IncidentDetail /> },
      { path: 'dashboard', element: <Dashboard /> },
      { path: 'settings', element: <AppSettings /> },
      { path: 'settings/appearance', element: <AppearanceSettings /> },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
])
