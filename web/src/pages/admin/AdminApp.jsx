import { BarChart3, CreditCard, FileClock, Image, LayoutDashboard, ListChecks, LogOut, Mic2, Package, Settings, Users, Wallet } from 'lucide-react'
import { lazy, Suspense } from 'react'
import { Link, Navigate, NavLink, Route, Routes } from 'react-router-dom'
import { Loading, Logo } from '../../components/ui'
import { useApp } from '../../context/App'
import { cls } from '../../lib/format'
import { Overview } from './Overview'

const Listings = lazy(() => import('./Listings'))
const Orders = lazy(() => import('./Orders'))
const Ops = lazy(() => import('./Ops'))

const NAV = [
  ['', 'Overview', LayoutDashboard], ['listings', 'Listings', ListChecks], ['orders', 'Orders', Package],
  ['payments', 'Payments', CreditCard], ['withdrawals', 'Withdrawals', Wallet], ['concerts', 'Concerts', Image],
  ['artists', 'Artists', Mic2], ['users', 'Users', Users], ['reports', 'Reports', BarChart3],
  ['settings', 'Settings', Settings, true], ['audit', 'Audit log', FileClock, true],
]

export default function AdminApp() {
  const { user, ready, logout } = useApp()
  if (!ready) return <Loading />
  if (!user) return <Navigate to="/login?next=/admin" replace />
  if (user.role === 'customer') return <div className="page pt-16 text-center"><p className="text-lg font-semibold">Admin access required</p><Link to="/" className="btn-ghost mt-4">Back to TicketNest</Link></div>
  const admin = user.role === 'admin'
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[232px_1fr]">
      <aside className="sticky top-0 z-40 border-b border-line bg-surface lg:h-screen lg:border-b-0 lg:border-r">
        <div className="flex h-16 items-center justify-between px-5"><Link to="/admin"><Logo /></Link><span className="rounded-md bg-accent/10 px-2 py-0.5 text-[11px] font-bold text-accent">ADMIN</span></div>
        <nav className="no-scrollbar flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible">
          {NAV.filter((n) => admin || !n[3]).map(([to, label, Icon]) => (
            <NavLink key={to} end={to === ''} to={`/admin/${to}`}
              className={({ isActive }) => cls('flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition', isActive ? 'bg-ink text-bg' : 'text-muted hover:bg-raised hover:text-ink')}>
              <Icon className="h-4 w-4" />{label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden px-3 lg:absolute lg:bottom-4 lg:block lg:w-full">
          <p className="truncate px-3 text-[12px] text-muted">{user.full_name} · {user.role}</p>
          <div className="mt-2 flex gap-1"><Link to="/" className="btn-ghost flex-1 py-2 text-[13px]">View site</Link>
            <button onClick={logout} className="btn-ghost py-2" aria-label="Sign out"><LogOut className="h-4 w-4" /></button></div>
        </div>
      </aside>
      <main className="min-w-0 p-4 sm:p-6 lg:p-8">
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route index element={<Overview />} />
            <Route path="listings/*" element={<Listings />} />
            <Route path="orders/*" element={<Orders />} />
            <Route path="*" element={<Ops />} />
          </Routes>
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
    <div className="no-scrollbar mb-4 flex gap-1 overflow-x-auto">
      {options.map(([v, l]) => (
        <button key={v} onClick={() => onChange(v)} className={cls('chip shrink-0', value === v && '!border-ink bg-ink !text-bg')}>{l}</button>
      ))}
    </div>
  )
}
