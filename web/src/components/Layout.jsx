import { Check, ChevronDown, Compass, Globe, Home as HomeIcon, LogOut, Menu, Moon, Plus, Search, Shield, Sun, Ticket, User, Wallet, X } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useApp } from '../context/App'
import { LANGS, useT } from '../i18n'
import { cls } from '../lib/format'
import Chatbot from './Chatbot'
import { PageTransition } from './Motion'
import { Avatar, Logo } from './ui'

export const MINI_APP_FALLBACK = 'https://t.me/TicketNestbot/app'
export const useMiniAppUrl = () => useApp().settings?.telegram?.mini_app_url || MINI_APP_FALLBACK

export function SearchBox({ className = '', big = false }) {
  const nav = useNavigate()
  const { t } = useT()
  const [q, setQ] = useState('')
  return (
    <form role="search" className={cls('relative', big && 'holo-ring rounded-full', className)}
      onSubmit={(e) => { e.preventDefault(); nav(`/concerts${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`) }}>
      <Search className={cls('pointer-events-none absolute top-1/2 -translate-y-1/2', big ? 'left-5 h-5 w-5 text-white/60' : 'left-3.5 h-4 w-4 text-muted')} />
      <input value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('Search concerts')} enterKeyHint="search"
        placeholder={t(big ? 'Search artist, concert or city' : 'Search artist, concert, city or venue')}
        className={big
          ? 'h-14 w-full truncate rounded-full border-0 bg-[#0B0A12]/70 pl-12 pr-16 text-[16px] text-white outline-none backdrop-blur-xl transition placeholder:text-white/45 focus:bg-[#0B0A12]/85 sm:h-[60px] sm:pr-36'
          : 'input h-10 bg-raised pl-10'} />
      {big && (
        <button aria-label={t('Search')} className="btn-holo absolute right-1.5 top-1.5 h-11 w-11 !rounded-full !p-0 sm:h-12 sm:w-auto sm:!px-6">
          <Search className="h-5 w-5 sm:hidden" /><span className="hidden sm:inline">{t('Search')}</span>
        </button>
      )}
    </form>
  )
}

function useOutside(ref, onOut) {
  useEffect(() => {
    const h = (e) => ref.current && !ref.current.contains(e.target) && onOut()
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [ref, onOut])
}

export function LangSwitch({ compact = false, up = false }) {
  const { lang, setLang } = useT()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useOutside(ref, () => setOpen(false))
  const cur = LANGS.find((l) => l.code === lang)
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex h-10 items-center gap-1.5 rounded-xl px-2.5 text-sm font-medium text-muted transition hover:bg-raised hover:text-ink" aria-label="Language">
        <Globe className="h-[18px] w-[18px]" />{!compact && <span>{cur.short}</span>}<ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className={cls('pop absolute right-0 z-50 w-40 overflow-hidden rounded-2xl border border-line bg-surface p-1 shadow-lift', up ? 'bottom-12' : 'top-12')}>
          {LANGS.map((l) => (
            <button key={l.code} onClick={() => { setLang(l.code); setOpen(false) }}
              className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm hover:bg-raised">
              {l.label}{l.code === lang && <Check className="h-4 w-4 text-accent" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ThemeToggle() {
  const { dark, applyTheme } = useApp()
  return (
    <button onClick={() => applyTheme(!dark)} className="grid h-10 w-10 place-items-center rounded-xl text-muted transition hover:bg-raised hover:text-ink"
      aria-label={dark ? 'Light theme' : 'Dark theme'}>
      <span className="transition-transform duration-500" style={{ transform: dark ? 'rotate(180deg)' : 'none' }}>
        {dark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
      </span>
    </button>
  )
}

export function TelegramIcon({ className = 'h-4 w-4' }) {
  return <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden><path d="M21.9 4.3 18.7 19.5c-.2 1-.9 1.3-1.8.8l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.3-5 9.1-8.2c.4-.4-.1-.6-.6-.2L6.2 13.2 1.4 11.7c-1-.3-1-1 .2-1.5L20.6 3c.9-.3 1.6.2 1.3 1.3Z" /></svg>
}

function MiniAppButton() {
  const { t } = useT()
  const url = useMiniAppUrl()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useOutside(ref, () => setOpen(false))
  return (
    <div ref={ref} className="relative hidden md:block">
      <button onClick={() => setOpen((o) => !o)} className="flex h-10 items-center gap-2 whitespace-nowrap rounded-xl bg-[#229ED9]/10 px-3 text-sm font-semibold text-[#229ED9] transition hover:-translate-y-px hover:bg-[#229ED9]/15">
        <TelegramIcon />{t('Telegram app')}
      </button>
      {open && (
        <div className="pop absolute right-0 top-12 z-50 w-64 rounded-2xl border border-line bg-surface p-4 text-center shadow-lift">
          <p className="text-sm font-semibold">{t('TicketNest in Telegram')}</p>
          <p className="mt-1 text-[12px] text-muted">{t('Scan with your phone, or open it directly. No download needed.')}</p>
          <div className="mx-auto mt-3 w-fit rounded-xl bg-white p-2.5"><QRCodeSVG value={url} size={150} /></div>
          <a href={url} target="_blank" rel="noreferrer" className="btn mt-3 w-full bg-[#229ED9] text-white hover:brightness-110"><TelegramIcon />{t('Open in Telegram')}</a>
        </div>
      )}
    </div>
  )
}

function UserMenu() {
  const { user, logout } = useApp()
  const { t } = useT()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useOutside(ref, () => setOpen(false))
  if (!user) return <Link to="/login" className="btn-primary hidden sm:inline-flex">{t('Sign in')}</Link>
  return (
    <div ref={ref} className="relative hidden sm:block">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-full border border-line bg-surface py-1 pl-1 pr-3 transition hover:border-ink/20 hover:shadow-card">
        <Avatar user={user} size={32} /><span className="max-w-[110px] truncate text-sm font-semibold">{user.full_name.split(' ')[0]}</span><ChevronDown className="h-3.5 w-3.5 text-muted" />
      </button>
      {open && (
        <div className="pop absolute right-0 top-12 z-50 w-60 overflow-hidden rounded-2xl border border-line bg-surface p-1.5 shadow-lift" onClick={() => setOpen(false)}>
          <div className="flex items-center gap-3 px-3 py-2.5"><Avatar user={user} size={38} /><div className="min-w-0"><p className="truncate text-sm font-semibold">{user.full_name}</p><p className="truncate text-[12px] text-muted">{user.email || (user.telegram_username && `@${user.telegram_username}`)}</p></div></div>
          <div className="my-1 h-px bg-line" />
          {[['/account', t('Profile & settings'), User], ['/account/orders', t('My orders'), Ticket], ['/account/listings', t('My listings'), Ticket], ['/account/wallet', t('Wallet'), Wallet]]
            .map(([to, l, Icon]) => <Link key={to} to={to} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-raised"><Icon className="h-4 w-4 text-muted" />{l}</Link>)}
          {user.role !== 'customer' && <Link to="/admin" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-raised"><Shield className="h-4 w-4 text-muted" />{t('Admin dashboard')}</Link>}
          <div className="my-1 h-px bg-line" />
          <button onClick={() => { logout(); nav('/') }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-bad hover:bg-bad/5"><LogOut className="h-4 w-4" />{t('Sign out')}</button>
        </div>
      )}
    </div>
  )
}

const NAV = [['/concerts', 'Explore'], ['/artists', 'Artists'], ['/how-it-works', 'How it works']]

export default function Layout() {
  const { user, logout } = useApp()
  const { t } = useT()
  const miniUrl = useMiniAppUrl()
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const loc = useLocation()
  useEffect(() => { setOpen(false); window.scrollTo(0, 0) }, [loc.pathname])
  useEffect(() => {
    const f = () => setScrolled(window.scrollY > 8)
    window.addEventListener('scroll', f, { passive: true })
    return () => window.removeEventListener('scroll', f)
  }, [])
  return (
    <div className="flex min-h-screen flex-col pb-[calc(64px+var(--safe-bottom))] lg:pb-0">
      <header className={cls('safe-header sticky top-0 z-50 border-b pt-[var(--safe-top)] transition-all duration-300', scrolled ? 'border-line bg-bg/85 shadow-card backdrop-blur-xl' : 'border-transparent bg-bg/60 backdrop-blur-md')}>
        <div className="page flex h-16 items-center gap-3">
          <Link to="/" aria-label="TicketNest" className="transition hover:opacity-80"><Logo /></Link>
          <nav className="ml-3 hidden items-center gap-1 lg:flex">
            {NAV.map(([to, label]) => (
              <NavLink key={to} to={to} className={({ isActive }) => cls('relative whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition hover:text-ink', isActive ? 'text-ink after:absolute after:inset-x-3 after:-bottom-[13px] after:h-0.5 after:rounded-full after:bg-accent' : 'text-muted')}>{t(label)}</NavLink>
            ))}
          </nav>
          <SearchBox className="ml-auto hidden w-[260px] xl:block" />
          <div className="ml-auto flex items-center gap-1 xl:ml-0">
            <MiniAppButton />
            <LangSwitch />
            <ThemeToggle />
            <Link to="/sell" className="btn-ghost hidden md:inline-flex"><Ticket className="h-4 w-4" />{t('Sell tickets')}</Link>
            <UserMenu />
            <button className="grid h-10 w-10 place-items-center rounded-xl transition hover:bg-raised lg:hidden" onClick={() => setOpen((o) => !o)} aria-label="Menu" aria-expanded={open}>
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
        {open && (
          <div className="rise border-t border-line bg-bg lg:hidden">
            <div className="page space-y-1 py-4">
              <SearchBox className="mb-3" />
              {[...NAV, ['/sell', 'Sell tickets'], ...(user ? [['/account', 'Profile & settings'], ['/account/orders', 'My orders']] : [['/login', 'Sign in'], ['/register', 'Create account']])].map(([to, label]) => (
                <Link key={to} to={to} className="block rounded-xl px-3 py-3 text-[15px] font-medium transition hover:bg-raised">{t(label)}</Link>
              ))}
              {user && user.role !== 'customer' && <Link to="/admin" className="block rounded-xl px-3 py-3 text-[15px] font-medium hover:bg-raised">{t('Admin dashboard')}</Link>}
              <a href={miniUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl px-3 py-3 text-[15px] font-semibold text-[#229ED9] hover:bg-raised"><TelegramIcon className="h-5 w-5" />{t('Open in Telegram')}</a>
              {user && <button onClick={logout} className="block w-full rounded-xl px-3 py-3 text-left text-[15px] font-medium text-bad hover:bg-raised">{t('Sign out')}</button>}
            </div>
          </div>
        )}
      </header>
      <main className="flex-1"><PageTransition><Outlet /></PageTransition></main>
      <Footer />
      <TabBar />
      <Chatbot />
    </div>
  )
}

function Footer() {
  const { settings, siteName } = useApp()
  const { t } = useT()
  const support = settings?.telegram?.support_username
  const links = [['/concerts', t('Concerts')], ['/sell', t('Sell')], ['/how-it-works', t('How it works')],
    ['/policies/refunds', t('Refunds')], ['/policies/terms', t('Terms')], ['/policies/privacy', t('Privacy')]]
  return (
    <footer className="mt-24 border-t border-line">
      <div className="page flex flex-col gap-5 py-8 md:flex-row md:items-center md:justify-between">
        <Logo />
        <nav className="flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-muted">
          {links.map(([to, l]) => <Link key={to} to={to} className="transition hover:text-ink">{l}</Link>)}
          {support && <a href={`https://t.me/${support}`} target="_blank" rel="noreferrer" className="transition hover:text-ink">{t('Support')}</a>}
        </nav>
      </div>
      <p className="page border-t border-line py-4 text-[11.5px] leading-relaxed text-muted">
        © {new Date().getFullYear()} {siteName} · {t('Independent resale marketplace, not affiliated with any artist or official seller.')}
      </p>
    </footer>
  )
}

// Phone / tablet: app-style bottom tabs (thumb reach), with Sell as the raised centre action.
function TabBar() {
  const { user } = useApp()
  const { t } = useT()
  const loc = useLocation()
  const p = loc.pathname
  const tabs = [
    ['/', t('Home'), HomeIcon, p === '/'],
    ['/concerts', t('Explore'), Compass, p.startsWith('/concerts') || p.startsWith('/artists')],
    ['/sell', t('Sell'), Plus, p.startsWith('/sell'), true],
    [user ? '/account/orders' : '/login', t('Tickets'), Ticket, p.startsWith('/account/orders') || p.startsWith('/orders')],
    [user ? '/account' : '/login', user ? t('Account') : t('Sign in'), User,
      (p.startsWith('/account') && !p.startsWith('/account/orders')) || p === '/login' || p === '/register'],
  ]
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-[60] border-t border-line/80 bg-surface/85 pb-[var(--safe-bottom)] backdrop-blur-xl lg:hidden">
      <div className="mx-auto grid h-16 max-w-md grid-cols-5 px-2">
        {tabs.map(([to, label, Icon, on, center]) => center ? (
          <Link key="sell" to={to} aria-label={label} className="group flex flex-col items-center justify-center">
            <span className="holo-bg -mt-6 grid h-[52px] w-[52px] place-items-center rounded-full text-white shadow-[0_10px_24px_-6px_rgba(214,90,200,.7)] ring-4 ring-bg transition group-active:scale-90">
              <Icon className="h-6 w-6" strokeWidth={2.4} />
            </span>
            <span className={cls('mt-0.5 text-[10.5px] font-semibold', on ? 'text-ink' : 'text-muted')}>{label}</span>
          </Link>
        ) : (
          <Link key={label} to={to} aria-current={on ? 'page' : undefined}
            className={cls('relative flex min-w-0 flex-col items-center justify-center gap-1 transition active:scale-90', on ? 'text-accent' : 'text-muted')}>
            {on && <span className="absolute top-1.5 h-1 w-1 rounded-full bg-accent shadow-[0_0_8px_2px_rgb(var(--accent)/.6)]" />}
            <Icon className="h-[22px] w-[22px]" strokeWidth={on ? 2.3 : 1.8} />
            <span className="max-w-full truncate px-1 text-[10.5px] font-semibold">{label}</span>
          </Link>
        ))}
      </div>
    </nav>
  )
}
