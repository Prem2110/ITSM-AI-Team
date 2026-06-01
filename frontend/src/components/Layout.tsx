import { Link, Outlet, useLocation } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Settings } from 'lucide-react'
import { clearFakeUser, getFakeUser } from '@/api/auth'
import { useNavigate } from 'react-router-dom'
import { useIsFetching } from '@tanstack/react-query'
import { useSetupStatus } from '@/hooks/useSetupStatus'
import { useTranslation } from 'react-i18next'
import { SettingsModal, type SettingsTab } from '@/components/SettingsModal'

function LoadingBar() {
  const isFetching = useIsFetching()
  const active = isFetching > 0
  const [mounted, setMounted] = useState(false)
  const [pct, setPct] = useState(0)
  const [fading, setFading] = useState(false)
  const prevRef = useRef(false)

  useEffect(() => {
    const was = prevRef.current
    prevRef.current = active

    if (active && !was) {
      setMounted(true)
      setFading(false)
      setPct(0)
      const t1 = setTimeout(() => setPct(35), 16)
      const t2 = setTimeout(() => setPct(78), 320)
      return () => { clearTimeout(t1); clearTimeout(t2) }
    }

    if (!active && was) {
      setPct(100)
      const t1 = setTimeout(() => setFading(true), 200)
      const t2 = setTimeout(() => { setMounted(false); setPct(0); setFading(false) }, 480)
      return () => { clearTimeout(t1); clearTimeout(t2) }
    }
  }, [active])

  if (!mounted) return null

  const transition = pct === 0
    ? 'none'
    : pct <= 35
    ? 'width 200ms cubic-bezier(0.16, 1, 0.3, 1)'
    : pct <= 78
    ? 'width 1400ms cubic-bezier(0.04, 0.6, 0.1, 1)'
    : 'width 200ms ease-out, opacity 220ms ease-out'

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 2, zIndex: 9999, pointerEvents: 'none' }}>
      <div style={{
        height: '100%',
        width: `${pct}%`,
        opacity: fading ? 0 : 1,
        background: 'linear-gradient(90deg, #6366f1, #818cf8)',
        transition,
      }} />
    </div>
  )
}

interface NavItem {
  label: string
  to: string
  matchFn?: (pathname: string, search: string) => boolean
  divider?: boolean
}

// Nav sections are built inside the component so labels re-render on language change

export default function Layout() {
  const navigate = useNavigate()
  const location = useLocation()
  const email = getFakeUser() ?? ''
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab]   = useState<SettingsTab>('general')
  const { data: setupStatus } = useSetupStatus()
  const { t } = useTranslation()

  function openSettings(tab: SettingsTab) {
    setSettingsTab(tab)
    setSettingsOpen(true)
  }

  const NAV_SECTIONS: { header: string; items: NavItem[] }[] = [
    {
      header: '',
      items: [
        { label: t('nav.dashboard'),    to: '/dashboard',  matchFn: (p) => p === '/dashboard' },
        { label: 'Predictive Analytics', to: '/analytics', matchFn: (p) => p === '/analytics' },
      ],
    },
    {
      header: t('nav.incidents'),
      items: [
        { label: 'Highly Critical',     to: '/incidents?priority=0',                                           matchFn: (_p, s) => s.includes('priority=0') },
        { label: t('nav.allOpen'),      to: '/incidents?state=new,assigned,in_progress,on_hold',              matchFn: (_p, s) => s.includes('state=new%2Cassigned%2Cin_progress%2Con_hold') || s.includes('state=new,assigned,in_progress,on_hold') },
        { label: t('nav.myOpen'),       to: '/incidents?assignee_id=me&state=new,assigned,in_progress,on_hold', matchFn: (_p, s) => s.includes('assignee_id=me') },
        { label: t('nav.unassigned'),   to: '/incidents?assignee_id=unassigned',                               matchFn: (_p, s) => s.includes('assignee_id=unassigned') },
        { label: t('nav.resolvedToday'),to: '/incidents?state=resolved',                                       matchFn: (_p, s) => s === '?state=resolved' || s === 'state=resolved' },
        { label: t('nav.allIncidents'), to: '/incidents',                                                      matchFn: (p, s) => p === '/incidents' && s === '' },
      ],
    },
    {
      header: t('nav.create'),
      items: [
        { label: t('nav.newIncident'), to: '/incidents/new' },
      ],
    },
  ]

  function handleLogout() {
    clearFakeUser()
    navigate('/login')
  }

  function isActive(item: NavItem): boolean {
    if (item.matchFn) {
      return item.matchFn(location.pathname, location.search)
    }
    return location.pathname === new URL(item.to, 'http://x').pathname &&
           location.search === new URL(item.to, 'http://x').search
  }


  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <LoadingBar />
      {/* Top bar */}
      <header
        className="flex-none flex items-center justify-between px-3 bg-white border-b border-surface-200"
        style={{ height: 44 }}
      >
        <Link to="/incidents" className="text-sm font-bold text-surface-800 tracking-tight" style={{ textDecoration: 'none' }}>
          {setupStatus?.company_name ?? 'ITSM'}
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-xs text-surface-500">{email}</span>
          <button
            onClick={() => openSettings('general')}
            className="flex items-center justify-center text-surface-500 hover:text-surface-700 hover:bg-surface-50 border border-surface-200 transition-colors"
            style={{ width: 26, height: 26, borderRadius: 2 }}
            title="Settings"
          >
            <Settings size={13} />
          </button>
          <button
            onClick={handleLogout}
            className="text-xs text-surface-500 hover:text-surface-700 border border-surface-200 px-2 py-0.5 hover:bg-surface-50 transition-colors"
            style={{ borderRadius: 2 }}
          >
            {t('nav.logout')}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside
          className="flex-none flex flex-col bg-surface-50 border-r border-surface-200 overflow-y-auto"
          style={{ width: 240 }}
        >
          <nav className="flex-1 py-1 flex flex-col justify-between">
            {NAV_SECTIONS.map(section => (
              <div key={section.header} className="mb-2">
                {section.header && (
                  <div className="px-3 py-1 text-2xs font-semibold text-surface-400 uppercase tracking-widest">
                    {section.header}
                  </div>
                )}
                {section.items.map(item => {
                  const active = isActive(item)
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={`block px-3 text-xs transition-colors ${
                        active
                          ? 'bg-surface-200 text-surface-800 font-medium'
                          : 'text-surface-700 hover:bg-surface-100'
                      }`}
                      style={{ height: 28, lineHeight: '28px', textDecoration: 'none' }}
                    >
                      {item.label}
                    </Link>
                  )
                })}
              </div>
            ))}
            {/* Bottom: Settings */}
            <div className="border-t border-surface-200 pt-1 mt-2">
              <button
                onClick={() => openSettings('general')}
                className={`flex items-center gap-2 px-3 text-xs transition-colors w-full text-left ${
                  settingsOpen && settingsTab === 'general'
                    ? 'bg-surface-200 text-surface-800 font-medium'
                    : 'text-surface-700 hover:bg-surface-100'
                }`}
                style={{ height: 28 }}
              >
                <Settings size={12} className="flex-none" />
                {t('nav.settings')}
              </button>
            </div>
          </nav>
        </aside>

        {/* Main content — NO padding here, pages handle their own */}
        <main className="flex-1 overflow-hidden bg-white flex flex-col">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              className="flex-1 flex flex-col overflow-hidden"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <SettingsModal
        open={settingsOpen}
        defaultTab={settingsTab}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  )
}
