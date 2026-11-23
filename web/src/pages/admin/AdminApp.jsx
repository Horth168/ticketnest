import { BarChart3, CreditCard, DatabaseBackup, FileClock, Image, LayoutDashboard, ListChecks, LogOut, Menu, Mic2, Moon, Package, Settings, Star, Sun, Users, Wallet, X } from 'lucide-react'
import { lazy, Suspense, useEffect, useState } from 'react'
import { Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { PageTransition } from '../../components/Motion'
import { Avatar, Loading, Logo } from '../../components/ui'
import { useApp } from '../../context/App'
import { useAdminLanguage } from './adminLang'
import { cls } from '../../lib/format'
import { Overview } from './Overview'

const Listings = lazy(() => import('./Listings'))
const Orders = lazy(() => import('./Orders'))
const Ops = lazy(() => import('./Ops'))

// grouped navigation: [group, [[path, label, icon, adminOnly]]]
export const GROUPS = [
  ['', [['', 'Overview', LayoutDashboard]]],
  ['Sales', [['orders', 'Orders', Package], ['payments', 'Payments', CreditCard], ['withdrawals', 'Withdrawals', Wallet]]],
  ['Catalogue', [['listings', 'Listings', ListChecks], ['concerts', 'Concerts', Image], ['artists', 'Artists', Mic2]]],
  ['People & reports', [['users', 'Users', Users], ['reviews', 'Reviews', Star], ['reports', 'Reports', BarChart3]]],
  ['System', [['settings', 'Settings', Settings, true], ['backups', 'Backups', DatabaseBackup, true], ['audit', 'Audit log', FileClock, true]]],
]

function NavList({ admin, onPick }) {
  return (
    <nav className="space-y-5 px-3">
      {GROUPS.map(([group, items]) => {
        const shown = items.filter((n) => admin || !n[3])
        if (!shown.length) return null
        return (
          <div key={group || 'main'}>
            {group && <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[.12em] text-muted/80">{group}</p>}
            <div className="space-y-0.5">
              {shown.map(([to, label, Icon]) => (
                <NavLink key={to} end={to === ''} to={`/admin/${to}`} onClick={onPick}
                  className={({ isActive }) => cls('group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
                    isActive ? 'bg-ink text-bg shadow-card' : 'text-muted hover:translate-x-0.5 hover:bg-raised hover:text-ink')}>
                  <Icon className="h-[18px] w-[18px]" />{label}
                </NavLink>
              ))}
            </div>
          </div>
        )
      })}
    </nav>
  )
}

function LangToggle({ lang, setLang, className = '' }) {
  return (
    <div data-no-translate className={cls('inline-flex rounded-lg border border-line bg-raised p-0.5 text-[12px] font-semibold', className)} role="group" aria-label="Language">
      {[['en', 'EN'], ['km', 'ខ្មែរ']].map(([k, l]) => (
        <button key={k} onClick={() => setLang(k)} aria-pressed={lang === k}
          className={cls('rounded-md px-2.5 py-1 transition', lang === k ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink')}>{l}</button>
      ))}
    </div>
  )
}

function Footer({ user, logout, dark, applyTheme, lang, setLang }) {
  return (
    <div className="border-t border-line p-3">
      <div className="flex items-center gap-3 rounded-xl px-2 py-2">
        <Avatar user={user} size={34} />
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{user.full_name}</p><p className="text-[12px] capitalize text-muted">{user.role}</p></div>
        <button onClick={() => applyTheme(!dark)} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-raised hover:text-ink" aria-label="Theme">{dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button>
        <button onClick={logout} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-raised hover:text-bad" aria-label="Sign out"><LogOut className="h-4 w-4" /></button>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <LangToggle lang={lang} setLang={setLang} />
        <Link to="/" className="btn-ghost flex-1 py-2 text-[13px]">View website</Link>
      </div>
    </div>
  )
}

// three lines that turn into an X
function Burger({ open }) {
  const line = 'absolute left-0 h-[2px] w-5 rounded-full bg-current transition-all duration-300 ease-[cubic-bezier(.32,.72,0,1)]'
  return (
    <span className="relative block h-4 w-5" aria-hidden>
      <span className={cls(line, open ? 'top-[7px] rotate-45' : 'top-0')} />
      <span className={cls(line, 'top-[7px]', open ? 'scale-x-0 opacity-0' : 'opacity-100')} />
      <span className={cls(line, open ? 'top-[7px] -rotate-45' : 'top-[14px]')} />
    </span>
  )
}

export default function AdminApp() {
  const { user, ready, logout, dark, applyTheme } = useApp()
  const [open, setOpen] = useState(false)
  const loc = useLocation()
  const [lang, setLang] = useAdminLanguage()
  useEffect(() => { setOpen(false); window.scrollTo(0, 0) }, [loc.pathname])
  useEffect(() => {
    if (!open) return undefined
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const k = (e) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', k)
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', k) }
  }, [open])
  if (!ready) return <Loading />
  if (!user) return <Navigate to="/login?next=/admin" replace />
  if (user.role === 'customer') return <div className="page pt-16 text-center"><p className="text-lg font-semibold">Admin access required</p><Link to="/" className="btn-ghost mt-4">Back to TicketNest</Link></div>
  const admin = user.role === 'admin'
  const current = GROUPS.flatMap(([, i]) => i).find(([to]) => (to ? loc.pathname.startsWith(`/admin/${to}`) : loc.pathname.replace(/\/$/, '') === '/admin'))
  return (
    <div className="min-h-screen bg-bg lg:grid lg:grid-cols-[248px_1fr]">
      {/* desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-line bg-surface lg:flex">
        <div className="flex h-16 items-center justify-between px-5"><Link to="/admin"><Logo /></Link><span className="rounded-md bg-accent/10 px-2 py-0.5 text-[10px] font-bold tracking-wider text-accent">ADMIN</span></div>
        <div className="flex-1 overflow-y-auto py-2"><NavList admin={admin} /></div>
        <Footer user={user} logout={logout} dark={dark} applyTheme={applyTheme} lang={lang} setLang={setLang} />
      </aside>

      {/* phone / tablet top bar */}
      <header className="sticky top-0 z-40 flex h-[calc(56px+var(--safe-top))] items-center gap-3 border-b border-line bg-surface/90 px-4 pt-[var(--safe-top)] backdrop-blur-xl lg:hidden">
        <button onClick={() => setOpen((o) => !o)} className="grid h-10 w-10 place-items-center rounded-xl border border-line transition active:scale-90" aria-label="Menu" aria-expanded={open}><Burger open={open} /></button>
        <div className="min-w-0 flex-1"><p className="text-[11px] font-semibold uppercase tracking-wider text-accent">Admin</p><p className="-mt-0.5 truncate font-semibold">{current?.[1] || 'TicketNest'}</p></div>
        <LangToggle lang={lang} setLang={setLang} />
        <Avatar user={user} size={34} />
      </header>
      {/* phone menu: always mounted so it can slide out as smoothly as it slides in */}
      <div className={cls('fixed inset-0 z-50 lg:hidden', open ? 'pointer-events-auto' : 'pointer-events-none')} aria-hidden={!open} inert={open ? undefined : ''}>
        <div className={cls('absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300 ease-out', open ? 'opacity-100' : 'opacity-0')} onClick={() => setOpen(false)} />
        <div className={cls('absolute inset-y-0 left-0 flex w-[82%] max-w-[300px] flex-col bg-surface pb-[var(--safe-bottom)] pt-[var(--safe-top)] shadow-lift will-change-transform',
          'transition-transform duration-[420ms] ease-[cubic-bezier(.32,.72,0,1)]', open ? 'translate-x-0' : '-translate-x-full')}>
          <div className="flex h-14 items-center justify-between px-5"><Logo />
            <button onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center rounded-full bg-raised transition active:scale-90" aria-label="Close"><X className="h-[18px] w-[18px]" /></button></div>
          <div className="flex-1 overflow-y-auto overscroll-contain py-2"><NavList admin={admin} onPick={() => setOpen(false)} /></div>
          <Footer user={user} logout={logout} dark={dark} applyTheme={applyTheme} lang={lang} setLang={setLang} />
        </div>
      </div>

      <main className="min-w-0 p-4 pb-[calc(16px+var(--safe-bottom))] sm:p-6 lg:p-8">
        <Suspense fallback={<Loading />}>
          <PageTransition>
            <Routes>
              <Route index element={<Overview />} />
              <Route path="listings/*" element={<Listings />} />
              <Route path="orders/*" element={<Orders />} />
              <Route path="*" element={<Ops />} />
            </Routes>
          </PageTransition>
        </Suspense>
      </main>
    </div>
  )
}

export function H({ title, sub, children }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl font-bold">{title}</h1>{sub && <p className="mt-1 text-sm text-muted">{sub}</p>}</div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  )
}

export function Tabs({ value, onChange, options }) {
  return (
    <div className="no-scrollbar -mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-1">
      {options.map(([v, l]) => (
        <button key={v} onClick={() => onChange(v)} className={cls('chip shrink-0', value === v && '!border-ink bg-ink !text-bg')}>{l}</button>
      ))}
    </div>
  )
}
