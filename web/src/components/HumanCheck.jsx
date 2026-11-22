// Cloudflare Turnstile bot check (same design as IceQ Sole). Invisible for most people
// ("interaction-only"): a checkbox only appears when Cloudflare is unsure. Renders nothing and returns
// an empty token until the API publishes a site key (settings.auth.turnstile_site_key).
import { useCallback, useEffect, useRef } from 'react'
import { useApp } from '../context/App'
import { useT } from '../i18n'

const SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
let scriptPromise
function loadScript() {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  scriptPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = SRC; s.async = true; s.defer = true
    s.onload = () => resolve(window.turnstile)
    s.onerror = () => { scriptPromise = undefined; reject(new Error('turnstile')) }
    document.head.appendChild(s)
  })
  return scriptPromise
}

/**
 * const human = useHuman()
 * <HumanCheck human={human} />              inside the form
 * const token = await human.token()         right before the request, then api(path, { human: token, ... })
 * Tokens are single-use, so the widget refreshes itself after each one is taken.
 */
export function useHuman() {
  const { settings } = useApp()
  const siteKey = settings?.auth?.turnstile_site_key || ''
  const state = useRef({ token: '', waiters: [], widget: null })

  const set = useCallback((t) => {
    state.current.token = t
    if (t) { state.current.waiters.forEach((w) => w(t)); state.current.waiters = [] }
  }, [])

  const token = useCallback(() => {
    if (!siteKey) return Promise.resolve('')
    const s = state.current
    const take = (t) => {
      s.token = ''
      setTimeout(() => { try { window.turnstile?.reset(s.widget) } catch { /* widget gone */ } }, 0)
      return t
    }
    if (s.token) return Promise.resolve(take(s.token))
    return new Promise((resolve) => {           // still checking: wait (the API answers clearly if it never arrives)
      const timer = setTimeout(() => resolve(''), 15000)
      s.waiters.push((t) => { clearTimeout(timer); resolve(take(t)) })
    })
  }, [siteKey])

  return { siteKey, token, set, state }
}

export default function HumanCheck({ human, className = '' }) {
  const { dark } = useApp()
  const { lang } = useT()
  const box = useRef(null)
  const { siteKey, set, state } = human

  useEffect(() => {
    if (!siteKey || !box.current) return
    let gone = false
    loadScript().then((ts) => {
      if (gone || !box.current) return
      state.current.widget = ts.render(box.current, {
        sitekey: siteKey,
        appearance: 'interaction-only',
        theme: dark ? 'dark' : 'light',
        language: lang === 'km' ? 'km' : lang === 'zh' ? 'zh-cn' : 'en',
        callback: set,
        'expired-callback': () => { set(''); try { ts.reset(state.current.widget) } catch { /* ignore */ } },
        'error-callback': () => set(''),
      })
    }).catch(() => {})
    return () => {
      gone = true
      try { if (state.current.widget != null) window.turnstile?.remove(state.current.widget) } catch { /* ignore */ }
      state.current.widget = null
    }
  }, [siteKey, dark, lang]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!siteKey) return null
  return <div ref={box} className={className} />
}
