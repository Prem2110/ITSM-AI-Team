import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import i18n from '@/i18n'

export type Theme = 'light' | 'dark' | 'system'
export type FontSize = 'compact' | 'default' | 'comfortable' | 'large'
export type FontFamily = 'system' | 'google-sans' | 'ibm-plex' | 'dm-sans'
export type Language = 'en' | 'fr' | 'de' | 'es' | 'zh' | 'hi'

const FONT_ZOOM: Record<FontSize, string> = {
  compact: '0.875',
  default: '1',
  comfortable: '1.1',
  large: '1.2',
}

const FONT_STACK: Record<FontFamily, string> = {
  system: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  'google-sans': '"Google Sans", sans-serif',
  'ibm-plex': '"IBM Plex Sans", sans-serif',
  'dm-sans': '"DM Sans", sans-serif',
}

interface SettingsCtx {
  theme: Theme
  fontSize: FontSize
  fontFamily: FontFamily
  language: Language
  setTheme: (t: Theme) => void
  setFontSize: (f: FontSize) => void
  setFontFamily: (f: FontFamily) => void
  setLanguage: (l: Language) => void
  resolvedTheme: 'light' | 'dark'
}

const Ctx = createContext<SettingsCtx | null>(null)

function getSystemDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle(
    'dark',
    theme === 'dark' || (theme === 'system' && getSystemDark())
  )
}

function applyFontSize(fontSize: FontSize) {
  document.body.style.zoom = FONT_ZOOM[fontSize]
}

function applyFontFamily(fontFamily: FontFamily) {
  document.documentElement.style.setProperty('--ui-font', FONT_STACK[fontFamily])
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(
    () => (localStorage.getItem('itsm:theme') as Theme | null) ?? 'light'
  )
  const [fontSize, setFontSizeState] = useState<FontSize>(
    () => (localStorage.getItem('itsm:fontSize') as FontSize | null) ?? 'default'
  )
  const [fontFamily, setFontFamilyState] = useState<FontFamily>(
    () => (localStorage.getItem('itsm:fontFamily') as FontFamily | null) ?? 'system'
  )
  const [language, setLanguageState] = useState<Language>(
    () => (localStorage.getItem('itsm:language') as Language | null) ?? 'en'
  )

  const resolvedTheme: 'light' | 'dark' =
    theme === 'system' ? (getSystemDark() ? 'dark' : 'light') : theme

  useEffect(() => {
    applyTheme(theme)
    if (theme === 'system') {
      const mql = window.matchMedia('(prefers-color-scheme: dark)')
      const handler = () => applyTheme('system')
      mql.addEventListener('change', handler)
      return () => mql.removeEventListener('change', handler)
    }
  }, [theme])

  useEffect(() => { applyFontSize(fontSize) }, [fontSize])
  useEffect(() => { applyFontFamily(fontFamily) }, [fontFamily])

  function setTheme(t: Theme) {
    localStorage.setItem('itsm:theme', t)
    setThemeState(t)
  }
  function setFontSize(f: FontSize) {
    localStorage.setItem('itsm:fontSize', f)
    setFontSizeState(f)
  }
  function setFontFamily(f: FontFamily) {
    localStorage.setItem('itsm:fontFamily', f)
    setFontFamilyState(f)
  }
  function setLanguage(l: Language) {
    localStorage.setItem('itsm:language', l)
    setLanguageState(l)
    i18n.changeLanguage(l)
  }

  return (
    <Ctx.Provider value={{ theme, fontSize, fontFamily, language, setTheme, setFontSize, setFontFamily, setLanguage, resolvedTheme }}>
      {children}
    </Ctx.Provider>
  )
}

export function useSettings() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useSettings outside SettingsProvider')
  return ctx
}
