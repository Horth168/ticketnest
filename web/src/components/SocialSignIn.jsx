// "Continue with Google" (Google Identity Services popup -> access token, verified on the server)
// and the official Telegram Login popup (data signed by Telegram, verified on the server).
import { useState } from 'react'
import { useApp } from '../context/App'
import { api } from '../lib/api'

const loaded = {}
function loadScript(src) {
  loaded[src] ||= new Promise((res, rej) => {
    const s = Object.assign(document.createElement('script'), { src, async: true, onload: res, onerror: rej })
    document.head.appendChild(s)
  })
  return loaded[src]
}

export function GoogleButton({ onDone, mode = 'login', label = 'Continue with Google' }) {
  const { settings, toast } = useApp()
  const clientId = settings?.auth?.google_client_id
  const [busy, setBusy] = useState(false)
  if (!clientId) return null
  const go = async () => {
    setBusy(true)
    try {
      await loadScript('https://accounts.google.com/gsi/client')
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId, scope: 'openid email profile',
        callback: async (resp) => {
          try {
            if (resp.error) throw new Error('Google sign-in was cancelled')
            const path = mode === 'link' ? '/api/account/link/google' : '/api/auth/google'
            onDone(await api(path, { method: 'POST', body: { access_token: resp.access_token } }))
          } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
        },
        error_callback: () => setBusy(false),
      })
      client.requestAccessToken()
    } catch { toast('Could not reach Google. Try again.', 'error'); setBusy(false) }
  }
  return (
    <button type="button" onClick={go} disabled={busy} className="btn-ghost w-full py-3">
      <svg viewBox="0 0 48 48" className="h-[18px] w-[18px]" aria-hidden><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
      {label}
    </button>
  )
}

export function TelegramButton({ onDone, mode = 'login', label = 'Continue with Telegram' }) {
  const { settings, toast } = useApp()
  const botId = settings?.telegram?.login_bot_id
  const [busy, setBusy] = useState(false)
  if (!botId) return null
  // Telegram's official login popup (same signed data as the widget, verified on the server),
  // opened from our own button so it matches the Google button exactly.
  const go = async () => {
    setBusy(true)
    try {
      await loadScript('https://telegram.org/js/telegram-widget.js?22')
      window.Telegram.Login.auth({ bot_id: botId, request_access: 'write' }, async (data) => {
        try {
          if (!data) return
          const path = mode === 'link' ? '/api/account/link/telegram' : '/api/auth/telegram'
          onDone(await api(path, { method: 'POST', body: data }))
        } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
      })
      setTimeout(() => setBusy(false), 4000)   // popup open; let the button be pressed again if it was closed
    } catch { toast('Could not reach Telegram. Try again.', 'error'); setBusy(false) }
  }
  return (
    <button type="button" onClick={go} disabled={busy} className="btn-ghost w-full py-3">
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden><circle cx="12" cy="12" r="12" fill="#2AABEE" /><path fill="#fff" d="M5.4 11.8 16.9 7.4c.5-.2 1 .1.8.9l-2 9.3c-.1.6-.5.8-1.1.5l-3-2.2-1.4 1.4c-.2.2-.3.3-.6.3l.2-3.1 5.6-5c.2-.2 0-.3-.4-.1l-6.9 4.3-3-.9c-.6-.2-.7-.6.2-1z" /></svg>
      {label}
    </button>
  )
}
