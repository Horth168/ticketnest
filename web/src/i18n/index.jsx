// Three languages: English (main), Khmer and Chinese.
// Strings are written in English in the code: t('Sell tickets'). The Khmer / Chinese dictionaries map that
// English text to the translation; anything missing simply shows in English (never a blank or a key).
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { setFormatLocale } from '../lib/format'
import km from './km'
import zh from './zh'

export const LANGS = [
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'km', label: 'ខ្មែរ', short: 'ខ្មែរ' },
  { code: 'zh', label: '中文', short: '中文' },
]
const DICTS = { km, zh }
const KEY = 'tn-lang'

function initial() {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved && ['en', 'km', 'zh'].includes(saved)) return saved
  } catch { /* private mode */ }
  const tgLang = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code || ''
  const nav = (tgLang || navigator.language || 'en').toLowerCase()
  if (nav.startsWith('km')) return 'km'
  if (nav.startsWith('zh')) return 'zh'
  return 'en'
}

const Ctx = createContext({ lang: 'en', setLang: () => {}, t: (s) => s })
export const useT = () => useContext(Ctx)

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(initial)
  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-Hans' : lang
    document.documentElement.dataset.lang = lang
  }, [lang])
  setFormatLocale(dateLocale(lang))
  const setLang = useCallback((l) => {
    setLangState(l)
    try { localStorage.setItem(KEY, l) } catch { /* ignore */ }
  }, [])
  const t = useCallback((s, vars) => {
    let out = (lang !== 'en' && DICTS[lang]?.[s]) || s
    if (vars) for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, v)
    return out
  }, [lang])
  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// Locale for dates/numbers
export const dateLocale = (lang) => ({ en: 'en-GB', km: 'km-KH', zh: 'zh-CN' }[lang] || 'en-GB')
