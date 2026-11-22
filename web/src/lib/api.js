// API client: JSON in/out, bearer token, automatic refresh-token rotation on 401.
const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
const KEY = 'tn-auth'

export const apiUrl = (path) => (path?.startsWith('http') ? path : `${BASE}${path}`)

const store = {
  get() { try { return JSON.parse(localStorage.getItem(KEY) || 'null') } catch { return null } },
  set(v) { try { v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY) } catch { /* private mode */ } },
}
let memory = store.get()
export const tokens = {
  get: () => memory,
  set: (v) => { memory = v; store.set(v) },
}

export class ApiError extends Error {
  constructor(status, detail, errors) { super(detail); this.status = status; this.errors = errors }
}

let refreshing = null
async function refresh() {
  const t = tokens.get()
  if (!t?.refresh_token) return false
  refreshing ||= fetch(apiUrl('/api/auth/refresh'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: t.refresh_token }),
  }).then(async (r) => {
    if (!r.ok) { tokens.set(null); return false }
    const d = await r.json()
    tokens.set({ access_token: d.access_token, refresh_token: d.refresh_token })
    return true
  }).catch(() => false).finally(() => { setTimeout(() => { refreshing = null }, 0) })
  return refreshing
}

export async function api(path, { method = 'GET', body, form, raw, retry = true, human } = {}) {
  const headers = {}
  if (human) headers['X-Human-Token'] = human   // Cloudflare Turnstile token (components/HumanCheck)
  const t = tokens.get()
  if (t?.access_token) headers.Authorization = `Bearer ${t.access_token}`
  let payload
  if (form) payload = form
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body) }
  let res
  try {
    res = await fetch(apiUrl(path), { method, headers, body: payload })
  } catch {
    throw new ApiError(0, 'Network error. Check your connection and try again.')
  }
  if (res.status === 401 && retry && t?.refresh_token && !path.startsWith('/api/auth/')) {
    if (await refresh()) return api(path, { method, body, form, raw, retry: false })
  }
  if (raw) {
    if (!res.ok) throw new ApiError(res.status, 'Could not load the file')
    return res
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(res.status, data?.detail || `Request failed (${res.status})`, data?.errors)
  return data
}

// Open a protected file (invoice, proof) in a new tab or download it.
export async function openFile(path, filename, download = false) {
  const res = await api(path, { raw: true })
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  if (download) {
    const a = Object.assign(document.createElement('a'), { href: url, download: filename })
    document.body.appendChild(a); a.click(); a.remove()
  } else window.open(url, '_blank', 'noopener')
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
