import { Link, Outlet, useLocation } from 'react-router-dom'
import { useState } from 'react'
import { clearFakeUser, getFakeUser } from '@/api/auth'
import { useNavigate } from 'react-router-dom'

interface NavItem {
  label: string
  to: string
  matchFn?: (pathname: string, search: string) => boolean
}

const NAV_SECTIONS: { header: string; items: NavItem[] }[] = [
  {
    header: 'INCIDENTS',
    items: [
      {
        label: 'All Open',
        to: '/incidents?state=new,assigned,in_progress,on_hold',
        matchFn: (_p, s) => s.includes('state=new%2Cassigned%2Cin_progress%2Con_hold') || s.includes('state=new,assigned,in_progress,on_hold'),
      },
      {
        label: 'My Open',
        to: '/incidents?assignee_id=me&state=new,assigned,in_progress,on_hold',
        matchFn: (_p, s) => s.includes('assignee_id=me'),
      },
      {
        label: 'Unassigned',
        to: '/incidents?assignee_id=unassigned',
        matchFn: (_p, s) => s.includes('assignee_id=unassigned'),
      },
      {
        label: 'Resolved Today',
        to: '/incidents?state=resolved',
        matchFn: (_p, s) => s === '?state=resolved' || s === 'state=resolved',
      },
      {
        label: 'All Incidents',
        to: '/incidents',
        matchFn: (p, s) => p === '/incidents' && s === '',
      },
    ],
  },
  {
    header: 'CREATE',
    items: [
      { label: 'New Incident', to: '/incidents/new' },
    ],
  },
]

export default function Layout() {
  const navigate = useNavigate()
  const location = useLocation()
  const email = getFakeUser() ?? ''
  const [navFilter, setNavFilter] = useState('')

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
          ITSM
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-xs text-surface-500">{email}</span>
          <button
            onClick={handleLogout}
            className="text-xs text-surface-500 hover:text-surface-700 border border-surface-200 px-2 py-0.5 hover:bg-surface-50 transition-colors"
            style={{ borderRadius: 2 }}
          >
            Logout
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
              placeholder="Filter navigator..."
              value={navFilter}
              onChange={e => setNavFilter(e.target.value)}
              className="w-full text-xs border border-surface-200 bg-white px-2 py-1 focus:outline-none focus:border-surface-400 placeholder-surface-400"
              style={{ borderRadius: 2 }}
            />
          </div>

          <nav className="flex-1 py-1">
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
          </nav>
        </aside>

        {/* Main content — NO padding here, pages handle their own */}
        <main className="flex-1 overflow-hidden bg-white flex flex-col">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
