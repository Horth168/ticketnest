import { BarChart3, CreditCard, FileClock, Image, LayoutDashboard, ListChecks, LogOut, Menu, Mic2, Moon, Package, Settings, Sun, Users, Wallet, X } from 'lucide-react'
import { lazy, Suspense, useEffect, useState } from 'react'
import { Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { PageTransition } from '../../components/Motion'
import { Avatar, Loading, Logo } from '../../components/ui'
import { useApp } from '../../context/App'
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
  ['People & reports', [['users', 'Users', Users], ['reports', 'Reports', BarChart3]]],
  ['System', [['settings', 'Settings', Settings, true], ['audit', 'Audit log', FileClock, true]]],
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

function Footer({ user, logout, dark, applyTheme }) {
  return (
    <div className="border-t border-line p-3">
      <div className="flex items-center gap-3 rounded-xl px-2 py-2">
        <Avatar user={user} size={34} />
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{user.full_name}</p><p className="text-[12px] capitalize text-muted">{user.role}</p></div>
        <button onClick={() => applyTheme(!dark)} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-raised hover:text-ink" aria-label="Theme">{dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button>
        <button onClick={logout} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-raised hover:text-bad" aria-label="Sign out"><LogOut className="h-4 w-4" /></button>
      </div>
      <Link to="/" className="btn-ghost mt-2 w-full py-2 text-[13px]">View website</Link>
    </div>
  )
}

export default function AdminApp() {
  const { user, ready, logout, dark, applyTheme } = useApp()
  const [open, setOpen] = useState(false)
  const loc = useLocation()
  useEffect(() => { setOpen(false); window.scrollTo(0, 0) }, [loc.pathname])
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
        <Footer user={user} logout={logout} dark={dark} applyTheme={applyTheme} />
      </aside>

      {/* phone / tablet top bar */}
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur-xl lg:hidden">
        <button onClick={() => setOpen(true)} className="grid h-10 w-10 place-items-center rounded-xl border border-line" aria-label="Menu"><Menu className="h-5 w-5" /></button>
        <div className="min-w-0 flex-1"><p className="text-[11px] font-semibold uppercase tracking-wider text-accent">Admin</p><p className="-mt-0.5 truncate font-semibold">{current?.[1] || 'TicketNest'}</p></div>
        <Avatar user={user} size={34} />
      </header>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="absolute inset-y-0 left-0 flex w-[82%] max-w-[300px] flex-col bg-surface shadow-lift" style={{ animation: 'drawer .28s cubic-bezier(.2,.7,.2,1)' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex h-14 items-center justify-between px-5"><Logo /><button onClick={() => setOpen(false)} aria-label="Close"><X className="h-5 w-5" /></button></div>
            <div className="flex-1 overflow-y-auto py-2"><NavList admin={admin} onPick={() => setOpen(false)} /></div>
            <Footer user={user} logout={logout} dark={dark} applyTheme={applyTheme} />
          </div>
        </div>
      )}

      <main className="min-w-0 p-4 sm:p-6 lg:p-8">
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
