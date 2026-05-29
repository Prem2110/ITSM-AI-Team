import { createBrowserRouter, Navigate } from 'react-router-dom'
import { RequireAuth, RequireSetup } from '@/components/RouteGuards'
import Layout from '@/components/Layout'
import Login from '@/pages/Login'
import Incidents from '@/pages/Incidents'
import IncidentNew from '@/pages/IncidentNew'
import IncidentDetail from '@/pages/IncidentDetail'
import Dashboard from '@/pages/Dashboard'
import Setup from '@/pages/Setup'

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
    ],
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
])
