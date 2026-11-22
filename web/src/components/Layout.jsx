import { Menu, Moon, Search, Sun, Ticket, User, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useApp } from '../context/App'
import { cls } from '../lib/format'
import { Logo } from './ui'

export function SearchBox({ className = '', autoFocus = false, big = false }) {
  const nav = useNavigate()
  const [q, setQ] = useState('')
  return (
    <form role="search" className={cls('relative', className)}
      onSubmit={(e) => { e.preventDefault(); nav(`/concerts${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`) }}>
      <Search className={cls('pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted', big ? 'h-5 w-5' : 'h-4 w-4')} />
      <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus={autoFocus} aria-label="Search concerts"
        placeholder="Search artist, concert, city or venue"
        className={cls('input pl-10', big ? 'h-14 rounded-2xl text-base shadow-card' : 'h-10 bg-raised')} />
    </form>
  )
}

function ThemeToggle() {
  const { dark, applyTheme } = useApp()
  return (
    <button onClick={() => applyTheme(!dark)} className="grid h-10 w-10 place-items-center rounded-xl text-muted hover:bg-raised hover:text-ink"
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}>
      {dark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
    </button>
  )
}

const NAV = [['/concerts', 'Explore'], ['/artists', 'Artists'], ['/how-it-works', 'How it works']]

export default function Layout() {
  const { user } = useApp()
  const [open, setOpen] = useState(false)
  const loc = useLocation()
  useEffect(() => { setOpen(false); window.scrollTo(0, 0) }, [loc.pathname])
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-50 border-b border-line bg-bg/85 backdrop-blur-md">
        <div className="page flex h-16 items-center gap-4">
          <Link to="/" aria-label="TicketNest home"><Logo /></Link>
          <nav className="ml-4 hidden items-center gap-1 md:flex">
            {NAV.map(([to, label]) => (
              <NavLink key={to} to={to} className={({ isActive }) => cls('whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition', isActive ? 'text-ink' : 'text-muted hover:text-ink')}>{label}</NavLink>
            ))}
          </nav>
          <SearchBox className="ml-auto hidden w-[300px] xl:block" />
          <div className="ml-auto flex items-center gap-1 xl:ml-0">
            <ThemeToggle />
            <Link to="/sell" className="btn-ghost hidden sm:inline-flex"><Ticket className="h-4 w-4" />Sell tickets</Link>
            {user
              ? <Link to={user.role !== 'customer' ? '/account' : '/account'} className="btn-primary hidden sm:inline-flex"><User className="h-4 w-4" />{user.full_name.split(' ')[0]}</Link>
              : <Link to="/login" className="btn-primary hidden sm:inline-flex">Sign in</Link>}
            <button className="grid h-10 w-10 place-items-center rounded-xl md:hidden" onClick={() => setOpen((o) => !o)} aria-label="Menu" aria-expanded={open}>
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
        {open && (
          <div className="border-t border-line bg-bg md:hidden">
            <div className="page space-y-1 py-4">
              <SearchBox className="mb-3" />
              {[...NAV, ['/sell', 'Sell tickets'], user ? ['/account', 'My account'] : ['/login', 'Sign in']].map(([to, label]) => (
                <Link key={to} to={to} className="block rounded-xl px-3 py-3 text-[15px] font-medium hover:bg-raised">{label}</Link>
              ))}
              {user && user.role !== 'customer' && <Link to="/admin" className="block rounded-xl px-3 py-3 text-[15px] font-medium hover:bg-raised">Admin</Link>}
            </div>
          </div>
        )}
      </header>
      <main className="flex-1"><Outlet /></main>
      <Footer />
    </div>
  )
}

function Footer() {
  const { settings, siteName } = useApp()
  const support = settings?.telegram?.support_username
  return (
    <footer className="mt-24 border-t border-line bg-surface">
      <div className="page grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2 lg:col-span-1">
          <Logo />
          <p className="mt-3 max-w-xs text-sm text-muted">{settings?.site?.tagline || 'The trusted way to buy and sell K-pop concert tickets.'}</p>
        </div>
        <FooterCol title="Marketplace" links={[['/concerts', 'Explore concerts'], ['/artists', 'Artists'], ['/sell', 'Sell your tickets'], ['/how-it-works', 'How it works']]} />
        <FooterCol title="Trust" links={[['/policies/authenticity', 'Ticket authenticity'], ['/policies/refunds', 'Refund policy'], ['/policies/terms', 'Terms of use'], ['/policies/privacy', 'Privacy']]} />
        <div>
          <p className="eyebrow mb-3">Support</p>
          {support ? <a href={`https://t.me/${support}`} target="_blank" rel="noreferrer" className="text-sm font-medium text-accent hover:underline">@{support} on Telegram</a>
            : <p className="text-sm text-muted">Support contact coming soon.</p>}
          <p className="mt-2 text-sm text-muted">Payments by KHQR · Bakong</p>
        </div>
      </div>
      <div className="border-t border-line">
        <p className="page py-5 text-[12px] leading-relaxed text-muted">
          © {new Date().getFullYear()} {siteName}. An independent resale marketplace, not affiliated with any artist, agency, promoter or official ticket seller.
          Ticket prices on resale may be above or below face value.
        </p>
      </div>
    </footer>
  )
}

function FooterCol({ title, links }) {
  return (
    <div>
      <p className="eyebrow mb-3">{title}</p>
      <ul className="space-y-2">{links.map(([to, l]) => <li key={to}><Link to={to} className="text-sm text-muted hover:text-ink">{l}</Link></li>)}</ul>
    </div>
  )
}

export function StageArt({ className = '' }) {
  // Stage beams over a crowd silhouette. Vector art, so it is crisp and light in both themes.
  return (
    <svg viewBox="0 0 1200 520" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden>
      <defs>
        <linearGradient id="beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".55" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
      </defs>
      <rect width="1200" height="520" fill="#0E0B1F" />
      {[[180, -14], [420, -5], [600, 0], [780, 5], [1020, 14]].map(([x, r], i) => (
        <g key={x} transform={`rotate(${r} ${x} 0)`} opacity={i === 2 ? 0.5 : 0.28}>
          <polygon points={`${x - 6},0 ${x + 6},0 ${x + 120},520 ${x - 120},520`} fill="url(#beam)" />
        </g>
      ))}
      <rect x="0" y="0" width="1200" height="6" fill="#6D4BFF" opacity=".9" />
      {[...Array(9)].map((_, i) => <circle key={i} cx={130 + i * 117} cy="18" r="5" fill="#fff" opacity=".85" />)}
      <path d="M0 520 V430 Q30 400 60 420 Q80 380 110 410 Q140 370 170 405 Q200 385 230 412 Q255 360 290 400 Q320 380 350 415 Q380 372 410 404 Q440 386 470 418 Q500 368 535 402 Q565 382 595 410 Q625 362 660 400 Q690 384 720 414 Q750 370 785 404 Q815 386 845 416 Q875 366 910 402 Q940 384 970 412 Q1000 372 1035 406 Q1065 388 1095 416 Q1125 376 1160 406 Q1180 396 1200 420 V520Z" fill="#05040C" />
      <path d="M262 362 l10 -40 l6 40Z M640 356 l8 -46 l8 46Z M902 360 l9 -38 l7 38Z" fill="#05040C" />
    </svg>
  )
}
