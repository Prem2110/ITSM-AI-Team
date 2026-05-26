import { createBrowserRouter, Navigate } from 'react-router-dom'
import { isAuthenticated } from '@/api/auth'
import Layout from '@/components/Layout'
import Login from '@/pages/Login'
import Incidents from '@/pages/Incidents'
import IncidentNew from '@/pages/IncidentNew'
import IncidentDetail from '@/pages/IncidentDetail'
import Dashboard from '@/pages/Dashboard'
import Settings from '@/pages/Settings'

function RequireAuth({ children }: { children: React.ReactNode }) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <Login />,
  },
  {
    path: '/',
    element: (
      <RequireAuth>
        <Layout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Navigate to="/incidents" replace /> },
      { path: 'incidents', element: <Incidents /> },
      { path: 'incidents/new', element: <IncidentNew /> },
      { path: 'incidents/:id', element: <IncidentDetail /> },
      { path: 'dashboard', element: <Dashboard /> },
      { path: 'settings', element: <Settings /> },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
])
