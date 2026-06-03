import { Link, Outlet, useLocation } from 'react-router-dom'
import { useState, useEffect, useRef, useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

function getRouteDepth(pathname: string): number {
  if (pathname === '/dashboard' || pathname === '/analytics') return 0
  if (pathname === '/incidents/new') return 2
  if (/^\/incidents\/[^/]+$/.test(pathname)) return 2
  if (pathname.startsWith('/incidents')) return 1
  return 0
}

const pageVariants = {
  initial: (dir: number) => ({ opacity: 0, x: dir > 0 ? 48 : dir < 0 ? -48 : 0, y: dir === 0 ? 5 : 0 }),
  animate: { opacity: 1, x: 0, y: 0 },
  exit:    (dir: number) => ({ opacity: 0, x: dir > 0 ? -32 : dir < 0 ? 32 : 0, y: dir === 0 ? -4 : 0 }),
}
import { Settings, Search, HelpCircle } from 'lucide-react'
import sierraLogo from '@/assets/sierralogo.png'
import { HelpModal } from '@/components/HelpModal'
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
  const [settingsExitTarget, setSettingsExitTarget] = useState<{ x: number; y: number } | null>(null)
  const settingsBtnRef = useRef<HTMLButtonElement>(null)

  const [helpOpen, setHelpOpen] = useState(false)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [paletteSearch, setPaletteSearch] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)

  const ALL_ACTIONS = [
    { name: 'Go to Dashboard', shortcut: 'G D', action: () => navigate('/dashboard'), icon: '📊' },
    { name: 'View Predictive Analytics', shortcut: 'G P', action: () => navigate('/analytics'), icon: '🧠' },
    { name: 'Create New Incident', shortcut: 'N I', action: () => navigate('/incidents/new'), icon: '➕' },
    { name: 'View All Incidents', shortcut: 'G I', action: () => navigate('/incidents'), icon: '🎫' },
    { name: 'Open System Settings', shortcut: 'S S', action: () => openSettings('general'), icon: '⚙️' },
    { name: 'Toggle Dark Mode', shortcut: 'T D', action: () => {
      const isDark = document.documentElement.classList.toggle('dark');
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
    }, icon: '🌙' }
  ]

  const filteredActions = paletteSearch.trim() === ''
    ? ALL_ACTIONS
    : ALL_ACTIONS.filter(act => act.name.toLowerCase().includes(paletteSearch.toLowerCase()))

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setCommandPaletteOpen(o => !o)
      } else if (e.key === 'Escape') {
        setCommandPaletteOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    setSelectedIndex(0)
  }, [paletteSearch])

  useEffect(() => {
    if (!commandPaletteOpen) return
    function handlePaletteKeys(e: KeyboardEvent) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex(i => (i + 1) % Math.max(1, filteredActions.length))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex(i => (i - 1 + filteredActions.length) % Math.max(1, filteredActions.length))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (filteredActions[selectedIndex]) {
          filteredActions[selectedIndex].action()
          setCommandPaletteOpen(false)
          setPaletteSearch('')
        }
      }
    }
    window.addEventListener('keydown', handlePaletteKeys)
    return () => window.removeEventListener('keydown', handlePaletteKeys)
  }, [commandPaletteOpen, filteredActions, selectedIndex])

  function handleCloseSettings() {
    const btn = settingsBtnRef.current
    if (btn) {
      const rect = btn.getBoundingClientRect()
      setSettingsExitTarget({
        x: rect.left + rect.width  / 2 - window.innerWidth  / 2,
        y: rect.top  + rect.height / 2 - window.innerHeight / 2,
      })
    }
    setSettingsOpen(false)
  }

  // Push/Pop direction tracking
  const prevPathRef = useRef(location.pathname)
  const dirRef = useRef(0)
  const navDirection = useMemo(() => {
    if (location.pathname === prevPathRef.current) return dirRef.current
    const d = getRouteDepth(location.pathname) > getRouteDepth(prevPathRef.current) ? 1
            : getRouteDepth(location.pathname) < getRouteDepth(prevPathRef.current) ? -1 : 0
    prevPathRef.current = location.pathname
    dirRef.current = d
    return d
  }, [location.pathname])
  useSetupStatus()
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
        <Link to="/incidents" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
          <img src={sierraLogo} alt="Sierra Digital" style={{ height: 26, width: 'auto', borderRadius: 3 }} />
        </Link>
        <div className="flex items-center gap-3">
          {/* Search Trigger Button */}
          <button
            onClick={() => setCommandPaletteOpen(true)}
            className="flex items-center gap-1.5 px-2 py-1 text-2xs text-surface-400 hover:text-surface-600 border border-surface-200 hover:border-surface-300 bg-surface-50 transition-colors"
            style={{ borderRadius: 4, height: 26 }}
            title="Press Ctrl+K to search"
          >
            <Search size={11} />
            <span>Search...</span>
            <kbd className="bg-white px-1.5 py-0.5 border border-surface-200 rounded text-3xs font-mono select-none">Ctrl+K</kbd>
          </button>
          <span className="text-xs text-surface-500">{email}</span>
          <button
            onClick={() => setHelpOpen(true)}
            className="flex items-center justify-center text-surface-500 hover:text-indigo-600 hover:bg-indigo-50 border border-surface-200 transition-colors"
            style={{ width: 26, height: 26, borderRadius: 2 }}
            title="Help & Guide"
          >
            <HelpCircle size={13} />
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
                    // Dock magnification — nav items shift right on hover like macOS Dock
                    <motion.div
                      key={item.to}
                      whileHover={{ x: 3 }}
                      whileTap={{ scale: 0.97 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                      className="relative px-1"
                    >
                      {active && (
                        <motion.div
                          layoutId="nav-indicator"
                          className="absolute inset-x-1 rounded bg-surface-200 dark:bg-slate-800 z-0 no-theme-transition"
                          style={{ height: 28, top: 0 }}
                          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                        />
                      )}
                      <Link
                        to={item.to}
                        className={`relative z-10 block px-2 text-xs transition-colors ${
                          active
                            ? 'text-surface-800 dark:text-surface-100 font-medium'
                            : 'text-surface-700 hover:bg-surface-100/40 dark:hover:bg-slate-800/30'
                        }`}
                        style={{ height: 28, lineHeight: '28px', textDecoration: 'none' }}
                      >
                        {item.label}
                      </Link>
                    </motion.div>
                  )
                })}
              </div>
            ))}
            {/* Bottom: Settings */}
            <div className="border-t border-surface-200 pt-1 mt-2">
              <button
                ref={settingsBtnRef}
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

        {/* Main content — Push/Pop navigation like iOS */}
        {/* position:relative + absolute motion.div prevents flex siblings splitting height during sync cross-fade */}
        <main className="flex-1 overflow-hidden bg-white" style={{ position: 'relative' }}>
          <AnimatePresence mode="sync" initial={false} custom={navDirection}>
            <motion.div
              key={location.pathname}
              custom={navDirection}
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />

      <SettingsModal
        open={settingsOpen}
        defaultTab={settingsTab}
        onClose={handleCloseSettings}
        exitTarget={settingsExitTarget}
      />

      {/* Command Palette Overlay Modal */}
      <AnimatePresence>
        {commandPaletteOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              exit={{ opacity: 0 }}
              onClick={() => setCommandPaletteOpen(false)}
              className="fixed inset-0 bg-slate-900 z-50 cursor-pointer"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: -10 }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
              className="fixed top-[15%] left-1/2 -translate-x-1/2 w-[500px] max-w-full bg-white dark:bg-slate-950 border border-surface-200 dark:border-slate-800 shadow-2xl rounded-xl z-50 overflow-hidden flex flex-col no-theme-transition backdrop-glass"
            >
              {/* Input */}
              <div className="flex items-center px-4 border-b border-surface-100 bg-transparent" style={{ height: 48 }}>
                <Search size={14} className="text-surface-400 mr-2.5 flex-none" />
                <input
                  autoFocus
                  value={paletteSearch}
                  onChange={e => setPaletteSearch(e.target.value)}
                  placeholder="Search dashboard actions, settings, pages..."
                  className="flex-1 bg-transparent border-none focus:outline-none text-xs text-surface-800"
                  style={{ border: 'none', background: 'transparent' }}
                />
                <kbd className="flex-none bg-surface-100 px-1.5 py-0.5 border border-surface-200 rounded text-3xs font-mono text-surface-400 select-none">ESC</kbd>
              </div>

              {/* Results */}
              <div className="max-h-[300px] overflow-y-auto p-1.5 flex flex-col gap-0.5 bg-transparent">
                {filteredActions.length === 0 ? (
                  <p className="text-xs text-surface-400 italic text-center py-6">No matching actions found</p>
                ) : (
                  filteredActions.map((act, idx) => {
                    const isSelected = idx === selectedIndex
                    return (
                      <button
                        key={act.name}
                        onClick={() => {
                          act.action()
                          setCommandPaletteOpen(false)
                          setPaletteSearch('')
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded text-left transition-colors ${
                          isSelected
                            ? 'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-400 font-medium'
                            : 'text-surface-700 hover:bg-surface-50 dark:hover:bg-slate-900/30'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="text-sm flex-none">{act.icon}</span>
                          <span className="text-xs">{act.name}</span>
                        </div>
                        {act.shortcut && (
                          <kbd className={`text-3xs font-mono px-1.5 py-0.5 border rounded ${
                            isSelected
                              ? 'bg-indigo-100/50 border-indigo-200 text-indigo-600'
                              : 'bg-surface-100 border-surface-200 text-surface-400'
                          }`}>
                            {act.shortcut}
                          </kbd>
                        )}
                      </button>
                    )
                  })
                )}
              </div>

              {/* Footer tips */}
              <div className="flex-none bg-surface-50 px-4 border-t border-surface-100 flex items-center justify-between text-4xs text-surface-400 font-medium uppercase tracking-wider" style={{ height: 28 }}>
                <span>Use ↑↓ to navigate, Enter to select</span>
                <span>Spotlight Palette</span>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
