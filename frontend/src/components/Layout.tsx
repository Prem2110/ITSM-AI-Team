import { Link, Outlet, useLocation } from 'react-router-dom'
import { useState } from 'react'
import { Settings, Palette } from 'lucide-react'
import { clearFakeUser, getFakeUser } from '@/api/auth'
import { useNavigate } from 'react-router-dom'
import { useSetupStatus } from '@/hooks/useSetupStatus'
import { useTranslation } from 'react-i18next'

interface NavItem {
  label: string
  to: string
  matchFn?: (pathname: string, search: string) => boolean
}

// Nav sections are built inside the component so labels re-render on language change

export default function Layout() {
  const navigate = useNavigate()
  const location = useLocation()
  const email = getFakeUser() ?? ''
  const [navFilter, setNavFilter] = useState('')
  const { data: setupStatus } = useSetupStatus()
  const { t } = useTranslation()

  const NAV_SECTIONS: { header: string; items: NavItem[] }[] = [
    {
      header: t('nav.incidents'),
      items: [
        { label: t('nav.dashboard'),      to: '/dashboard',                                             matchFn: (p) => p === '/dashboard' },
        { label: t('nav.allOpen'),         to: '/incidents?state=new,assigned,in_progress,on_hold',     matchFn: (_p, s) => s.includes('state=new%2Cassigned%2Cin_progress%2Con_hold') || s.includes('state=new,assigned,in_progress,on_hold') },
        { label: t('nav.myOpen'),          to: '/incidents?assignee_id=me&state=new,assigned,in_progress,on_hold', matchFn: (_p, s) => s.includes('assignee_id=me') },
        { label: t('nav.unassigned'),      to: '/incidents?assignee_id=unassigned',                    matchFn: (_p, s) => s.includes('assignee_id=unassigned') },
        { label: t('nav.resolvedToday'),   to: '/incidents?state=resolved',                            matchFn: (_p, s) => s === '?state=resolved' || s === 'state=resolved' },
        { label: t('nav.allIncidents'),    to: '/incidents',                                            matchFn: (p, s) => p === '/incidents' && s === '' },
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

  const filteredSections = NAV_SECTIONS.map(section => ({
    ...section,
    items: section.items.filter(item =>
      item.label.toLowerCase().includes(navFilter.toLowerCase())
    ),
  })).filter(s => s.items.length > 0 || navFilter === '')

  return (
    <div className="h-screen flex flex-col overflow-hidden">
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
          <Link
            to="/settings"
            className="flex items-center justify-center text-surface-500 hover:text-surface-700 hover:bg-surface-50 border border-surface-200 transition-colors"
            style={{ width: 26, height: 26, borderRadius: 2 }}
            title="Settings"
          >
            <Settings size={13} />
          </Link>
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
          <div className="px-2 pt-2 pb-1">
            <input
              type="text"
              placeholder={t('nav.filterPlaceholder')}
              value={navFilter}
              onChange={e => setNavFilter(e.target.value)}
              className="w-full text-xs border border-surface-200 bg-white px-2 py-1 focus:outline-none focus:border-surface-400 placeholder-surface-400"
              style={{ borderRadius: 2 }}
            />
          </div>

          <nav className="flex-1 py-1 flex flex-col justify-between">
            {filteredSections.map(section => (
              <div key={section.header} className="mb-2">
                <div className="px-3 py-1 text-2xs font-semibold text-surface-400 uppercase tracking-widest">
                  {section.header}
                </div>
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
              <Link
                to="/settings"
                className={`flex items-center gap-2 px-3 text-xs transition-colors ${
                  location.pathname === '/settings'
                    ? 'bg-surface-200 text-surface-800 font-medium'
                    : 'text-surface-700 hover:bg-surface-100'
                }`}
                style={{ height: 28, lineHeight: '28px', textDecoration: 'none' }}
              >
                <Settings size={12} className="flex-none" />
                {t('nav.settings')}
              </Link>
              <Link
                to="/settings/appearance"
                className={`flex items-center gap-2 px-3 text-xs transition-colors ${
                  location.pathname === '/settings/appearance'
                    ? 'bg-surface-200 text-surface-800 font-medium'
                    : 'text-surface-700 hover:bg-surface-100'
                }`}
                style={{ height: 28, lineHeight: '28px', textDecoration: 'none' }}
              >
                <Palette size={12} className="flex-none" />
                {t('nav.appearance')}
              </Link>
            </div>
          </nav>
        </aside>

        {/* Main content — NO padding here, pages handle their own */}
        <main className="flex-1 overflow-hidden bg-white flex flex-col">
          <div key={location.pathname} className="animate-page-enter flex-1 flex flex-col overflow-hidden">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
