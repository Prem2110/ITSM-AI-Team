import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import { router } from './router'
import { SettingsProvider } from './contexts/SettingsContext'

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
    <MotionConfig reducedMotion="user">
      <SettingsProvider>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </SettingsProvider>
    </MotionConfig>
  )
}
