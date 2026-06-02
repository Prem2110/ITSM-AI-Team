import { Component, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import { router } from './router'
import { SettingsProvider } from './contexts/SettingsContext'

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 12,
          fontFamily: 'system-ui, sans-serif', color: '#475569',
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>Something went wrong</div>
          <div style={{ fontSize: 11, maxWidth: 420, textAlign: 'center', color: '#64748b' }}>
            {(this.state.error as Error).message}
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: 8, fontSize: 11, padding: '5px 14px',
              border: '1px solid #e2e8f0', borderRadius: 4, cursor: 'pointer',
              background: '#f8fafc', color: '#475569',
            }}
          >
            Reload page
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

export default function App() {
  return (
    <ErrorBoundary>
      <MotionConfig reducedMotion="user">
        <SettingsProvider>
          <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
          </QueryClientProvider>
        </SettingsProvider>
      </MotionConfig>
    </ErrorBoundary>
  )
}
