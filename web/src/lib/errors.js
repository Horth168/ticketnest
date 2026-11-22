// Reports website crashes to the API, which alerts the admin Telegram group (rate-limited there too).
// Sends only the error message, the page path and the script location: never form data or tokens.
import { apiUrl } from './api'

const IGNORE = [/ResizeObserver loop/i, /Script error\.?$/i, /extension:\/\//i, /Non-Error promise rejection/i,
  /Load failed$/i, /Failed to fetch$/i, /NetworkError/i, /AbortError/i, /cancelled|canceled/i]
const sent = new Set()

function report(message, source = '') {
  const msg = String(message || '').slice(0, 480)
  if (!msg || IGNORE.some((r) => r.test(msg) || r.test(source)) || sent.has(msg) || sent.size >= 5) return
  sent.add(msg)
  try {
    fetch(apiUrl('/api/client-errors'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
      body: JSON.stringify({ message: msg, page: location.pathname.slice(0, 280), source: String(source).slice(0, 280) }),
    }).catch(() => {})
  } catch { /* never let reporting break the page */ }
}

// After a new deploy an open tab may ask for old file names that no longer exist: reload once.
function staleChunk(msg) {
  if (!/dynamically imported module|Importing a module script failed|error loading dynamically/i.test(msg)) return false
  try {
    if (sessionStorage.getItem('tn-reloaded')) return false
    sessionStorage.setItem('tn-reloaded', '1')
  } catch { return false }
  location.reload()
  return true
}

export function installErrorReporting() {
  if (import.meta.env.DEV) return
  window.addEventListener('error', (e) => {
    const msg = e?.error?.message || e?.message || ''
    if (!staleChunk(msg)) report(msg, `${(e.filename || '').split('/').pop()}:${e.lineno || ''}`)
  })
  window.addEventListener('unhandledrejection', (e) => {
    const msg = e?.reason?.message || String(e?.reason || '')
    if (e?.reason?.status) return   // API errors (4xx/5xx) are already handled on the server side
    if (!staleChunk(msg)) report(msg, 'promise')
  })
  setTimeout(() => { try { sessionStorage.removeItem('tn-reloaded') } catch { /* ignore */ } }, 15000)
}

export { report as reportError }
