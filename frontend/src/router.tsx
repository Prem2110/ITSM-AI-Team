import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { RequireAuth, RequireSetup } from '@/components/RouteGuards'
import Layout from '@/components/Layout'
import { PageSpinner } from '@/components/Skeleton'

const Setup = lazy(() => import('@/pages/Setup'))
const Login = lazy(() => import('@/pages/Login'))
const Incidents = lazy(() => import('@/pages/Incidents'))
const IncidentNew = lazy(() => import('@/pages/IncidentNew'))
const IncidentDetail = lazy(() => import('@/pages/IncidentDetail'))
const Dashboard = lazy(() => import('@/pages/Dashboard'))

export const router = createBrowserRouter([
  { path: '/setup', element: <Suspense fallback={<PageSpinner />}><Setup /></Suspense> },
  {
    path: '/login',
    element: (
      <RequireSetup>
        <Suspense fallback={<PageSpinner />}>
          <Login />
        </Suspense>
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
      { path: 'incidents', element: <Suspense fallback={<PageSpinner />}><Incidents /></Suspense> },
      { path: 'incidents/new', element: <Suspense fallback={<PageSpinner />}><IncidentNew /></Suspense> },
      { path: 'incidents/:id', element: <Suspense fallback={<PageSpinner />}><IncidentDetail /></Suspense> },
      { path: 'dashboard', element: <Suspense fallback={<PageSpinner />}><Dashboard /></Suspense> },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
])
