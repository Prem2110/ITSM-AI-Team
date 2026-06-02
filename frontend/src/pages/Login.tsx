import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { setFakeUser } from '@/api/auth'

const SEEDED_USERS = [
  { email: 'karthik.byju@acme.com', label: 'Karthik Byju (admin)'   },
  { email: 'prem@acme.com',         label: 'Prem (agent)'            },
  { email: 'ashok@acme.com',        label: 'Ashok (requester)'       },
]

export default function Login() {
  const [selected, setSelected] = useState(SEEDED_USERS[1].email)
  const navigate = useNavigate()
  const { t } = useTranslation()

  function handleLogin() {
    setFakeUser(selected)
    navigate('/incidents')
  }

  return (
    <div className="min-h-screen bg-surface-100 flex items-center justify-center">
      <div className="bg-white border border-surface-200 p-6 w-80" style={{ borderRadius: 3 }}>
        <div className="mb-4">
          <div className="text-sm font-semibold text-surface-800 mb-0.5">{t('login.title')}</div>
          <div className="text-xs text-surface-500">{t('login.subtitle')}</div>
        </div>

        <div className="mb-3">
          <label className="block text-xs text-surface-600 mb-1 font-medium">{t('login.signInAs')}</label>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="w-full border border-surface-200 bg-white text-xs px-2 py-1.5 focus:outline-none focus:border-surface-400"
            style={{ borderRadius: 2 }}
          >
            {SEEDED_USERS.map((u) => (
              <option key={u.email} value={u.email}>{u.label}</option>
            ))}
          </select>
        </div>

        <button
          onClick={handleLogin}
          className="w-full bg-surface-800 text-white text-xs font-medium py-1.5 hover:bg-surface-700 transition-colors"
          style={{ borderRadius: 2 }}
        >
          {t('login.logIn')}
        </button>
      </div>
    </div>
  )
}
