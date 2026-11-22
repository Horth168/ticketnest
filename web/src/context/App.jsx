// App-wide state: signed-in user, public settings, theme, toasts, and the link base
// ('' on the website, '/tg' inside the Telegram Mini App) so pages work in both shells.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, tokens } from '../lib/api'

const Ctx = createContext(null)
export const useApp = () => useContext(Ctx)

export function AppProvider({ children }) {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)
  const [settings, setSettings] = useState(null)
  const [toasts, setToasts] = useState([])
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))

  useEffect(() => {
    api('/api/settings/public').then(setSettings).catch(() => setSettings({}))
    if (!tokens.get()) { setReady(true); return }
    api('/api/account/me').then(setUser).catch(() => tokens.set(null)).finally(() => setReady(true))
  }, [])

  const applyTheme = useCallback((isDark, persist = true) => {
    document.documentElement.classList.toggle('dark', isDark)
    setDark(isDark)
    if (persist) { try { localStorage.setItem('tn-theme', isDark ? 'dark' : 'light') } catch { /* ignore */ } }
  }, [])

  const toast = useCallback((text, kind = 'info') => {
    const id = Math.random()
    setToasts((t) => [...t, { id, text, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200)
  }, [])

  const signedIn = useCallback((data) => {
    tokens.set({ access_token: data.access_token, refresh_token: data.refresh_token })
    setUser(data.user)
  }, [])

  const logout = useCallback(async () => {
    const t = tokens.get()
    tokens.set(null)
    setUser(null)
    if (t?.refresh_token) api('/api/auth/logout', { method: 'POST', body: { refresh_token: t.refresh_token } }).catch(() => {})
  }, [])

  const value = useMemo(() => ({
    user, setUser, ready, settings, dark, applyTheme, toast, signedIn, logout,
    siteName: settings?.site?.name || 'TicketNest',
  }), [user, ready, settings, dark, applyTheme, toast, signedIn, logout])

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(16px+var(--safe-bottom))] z-[100] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div key={t.id} role="status"
            className={`rise pointer-events-auto max-w-md rounded-xl px-4 py-3 text-sm font-medium shadow-lift ${t.kind === 'error' ? 'bg-bad text-white' : 'bg-ink text-bg'}`}>
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

// '' on the website, '/tg' in the Mini App
const BaseCtx = createContext('')
export const BaseProvider = BaseCtx.Provider
export const useBase = () => useContext(BaseCtx)
export const useLink = () => { const b = useBase(); return (p) => `${b}${p}` }
