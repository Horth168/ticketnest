// The Telegram Mini App: same backend, same pages, Telegram-native shell.
// - signs in with Telegram's signed initData (validated on the server)
// - follows Telegram's light/dark theme, safe areas, BackButton, MainButton and haptics
// - bottom tab bar instead of the website header
import { Home as HomeIcon, MessageCircle, Plus, Search, Ticket, User } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { ArtistTile, ConcertCard, SkeletonCards } from '../components/cards'
import { Empty, Loading, Logo, Spinner } from '../components/ui'
import { BaseProvider, useApp } from '../context/App'
import { api } from '../lib/api'
import { cls } from '../lib/format'
import { haptic, inTelegram, openExternal, tg } from '../lib/telegram'
import Account, { MyInvoices, MyListings, MyOrders, MyWallet, Profile } from '../pages/account/Account'
import Checkout, { OrderPage, RequireAuth } from '../pages/Checkout'
import Concert, { Artist } from '../pages/Concert'
import Explore from '../pages/Explore'
import { useHome } from '../pages/Home'
import { Policy, Support } from '../pages/Info'
import Sell from '../pages/Sell'

let signInOnce = null   // one sign-in per app launch (effects can run twice)

function useTelegramShell() {
  const { applyTheme, signedIn, user, ready } = useApp()
  const [state, setState] = useState('starting')
  useEffect(() => {
    const w = tg()
    if (!w?.initData) { setState('outside'); return }
    w.ready(); w.expand()
    try { w.disableVerticalSwipes?.() } catch { /* older clients */ }
    const theme = () => {
      applyTheme(w.colorScheme === 'dark', false)
      const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim().split(' ').map(Number)
      const hex = '#' + bg.map((n) => n.toString(16).padStart(2, '0')).join('')
      try { w.setHeaderColor(hex); w.setBackgroundColor(hex); w.setBottomBarColor?.(hex) } catch { /* ignore */ }
    }
    const insets = () => {
      const s = w.contentSafeAreaInset || {}, d = w.safeAreaInset || {}
      document.documentElement.style.setProperty('--safe-top', `${(s.top || 0) + (d.top || 0)}px`)
      document.documentElement.style.setProperty('--safe-bottom', `${(s.bottom || 0) + (d.bottom || 0)}px`)
    }
    theme(); insets()
    w.onEvent('themeChanged', theme)
    w.onEvent('safeAreaChanged', insets); w.onEvent('contentSafeAreaChanged', insets)
    return () => { w.offEvent('themeChanged', theme); w.offEvent('safeAreaChanged', insets); w.offEvent('contentSafeAreaChanged', insets) }
  }, [applyTheme])
  useEffect(() => {
    const w = tg()
    if (!w?.initData || !ready) return
    const tid = w.initDataUnsafe?.user?.id
    if (user && user.telegram_id === tid) { setState('ready'); return }
    // always (re)sign in with the signed initData - never trust the unsigned user object
    signInOnce ||= api('/api/auth/telegram-app', { method: 'POST', body: { init_data: w.initData } })
    signInOnce.then((d) => { signedIn(d); setState('ready') }).catch(() => { signInOnce = null; setState('error') })
  }, [ready]) // eslint-disable-line react-hooks/exhaustive-deps
  return state
}

function useBackButton() {
  const loc = useLocation()
  const nav = useNavigate()
  useEffect(() => {
    const bb = tg()?.BackButton
    if (!bb || !inTelegram()) return
    const root = ['/tg', '/tg/', '/tg/explore', '/tg/sell', '/tg/orders', '/tg/profile'].includes(loc.pathname)
    const back = () => { haptic('light'); nav(-1) }
    root ? bb.hide() : bb.show()
    bb.onClick(back)
    return () => bb.offClick(back)
  }, [loc.pathname, nav])
}

const TABS = [['/tg', 'Home', HomeIcon, true], ['/tg/explore', 'Explore', Search], ['/tg/sell', 'Sell', Plus], ['/tg/orders', 'Orders', Ticket], ['/tg/profile', 'Profile', User]]

export default function MiniApp() {
  const state = useTelegramShell()
  useBackButton()
  const loc = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [loc.pathname])
  if (state === 'outside') return <Outside />
  if (state === 'starting') return <div className="grid min-h-screen place-items-center"><Spinner className="h-6 w-6 text-muted" /></div>
  if (state === 'error') return <div className="page pt-16"><Empty title="Couldn't sign you in">Close and reopen the app from the TicketNest bot. If it keeps happening, contact support.</Empty></div>
  const hideTabs = /\/(checkout|orders\/TN)/.test(loc.pathname)
  return (
    <BaseProvider value="/tg">
      <div className="min-h-screen pb-[calc(84px+var(--safe-bottom))] pt-[var(--safe-top)]">
        <Routes>
          <Route index element={<TgHome />} />
          <Route path="explore" element={<Explore compact />} />
          <Route path="search" element={<TgSearch />} />
          <Route path="concerts/:slug" element={<Concert />} />
          <Route path="artists/:slug" element={<Artist />} />
          <Route path="checkout/:listingId" element={<RequireAuth><Checkout /></RequireAuth>} />
          <Route path="orders/:number" element={<RequireAuth><OrderPage /></RequireAuth>} />
          <Route path="sell" element={<RequireAuth><Sell /></RequireAuth>} />
          <Route path="orders" element={<RequireAuth><div className="page pt-5"><h1 className="mb-4 text-2xl font-bold">My orders</h1><MyOrders /></div></RequireAuth>} />
          <Route path="listings" element={<RequireAuth><div className="page pt-5"><h1 className="mb-4 text-2xl font-bold">My listings</h1><MyListings /></div></RequireAuth>} />
          <Route path="account" element={<RequireAuth><Account /></RequireAuth>}>
            <Route index element={<Profile />} /><Route path="orders" element={<MyOrders />} /><Route path="listings" element={<MyListings />} />
            <Route path="wallet" element={<MyWallet />} /><Route path="invoices" element={<MyInvoices />} />
          </Route>
          <Route path="profile" element={<RequireAuth><TgProfile /></RequireAuth>} />
          <Route path="support" element={<Support />} />
          <Route path="policies/:slug" element={<Policy />} />
          <Route path="*" element={<TgHome />} />
        </Routes>
      </div>
      {!hideTabs && (
        <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-bg/95 pb-[var(--safe-bottom)] backdrop-blur">
          <div className="mx-auto grid max-w-lg grid-cols-5">
            {TABS.map(([to, label, Icon, end]) => (
              <NavLink key={to} to={to} end={end} onClick={() => haptic('light')}
                className={({ isActive }) => cls('flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold transition', isActive ? 'text-accent' : 'text-muted')}>
                <Icon className="h-[22px] w-[22px]" />{label}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </BaseProvider>
  )
}

function TgHome() {
  const { data } = useHome()
  const { user } = useApp()
  return (
    <div className="page pt-4">
      <div className="flex items-center justify-between"><Logo /><span className="text-[13px] text-muted">Hi, {user?.full_name?.split(' ')[0]}</span></div>
      <Link to="/tg/search" className="input mt-4 flex items-center gap-2 text-muted"><Search className="h-4 w-4" />Search artist, concert or city</Link>
      <Link to="/tg/sell" className="mt-4 flex items-center justify-between rounded-2xl bg-ink p-4 text-bg">
        <div><p className="font-semibold">Can't make the show?</p><p className="text-[13px] text-bg/70">Sell your tickets to fans</p></div><span className="rounded-xl bg-bg px-3 py-2 text-sm font-semibold text-ink">Sell</span>
      </Link>
      <h2 className="mb-3 mt-7 text-xl font-bold">Featured</h2>
      <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4">
        {!data ? <div className="w-[78%] shrink-0"><SkeletonCards n={1} /></div> : data.featured.length
          ? data.featured.map((c) => <div key={c.id} className="w-[78%] max-w-[320px] shrink-0 snap-start"><ConcertCard c={c} /></div>)
          : <p className="text-sm text-muted">No concerts yet — check back soon.</p>}
      </div>
      {data?.artists?.length > 0 && <>
        <h2 className="mb-3 mt-7 text-xl font-bold">Popular artists</h2>
        <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4">{data.artists.map((a) => <ArtistTile key={a.id} a={a} />)}</div>
      </>}
      {data?.upcoming?.length > 0 && <>
        <h2 className="mb-3 mt-7 text-xl font-bold">Upcoming events</h2>
        <div className="grid gap-4 sm:grid-cols-2">{data.upcoming.map((c) => <ConcertCard key={c.id} c={c} />)}</div>
      </>}
      {data?.recent_listings?.length > 0 && <>
        <h2 className="mb-3 mt-7 text-xl font-bold">Available tickets</h2>
        <div className="card divide-y divide-line">{data.recent_listings.map((l) => (
          <Link key={l.id} to={`/tg/concerts/${l.concert.slug}`} className="flex items-center justify-between gap-3 p-3.5">
            <div className="min-w-0"><p className="truncate text-sm font-semibold">{l.concert.title}</p><p className="text-[12px] text-muted">{l.category} · {l.available} left</p></div>
            <b className="tabular-nums">${(l.buyer_price_cents / 100).toFixed(0)}</b>
          </Link>
        ))}</div>
      </>}
    </div>
  )
}

function TgSearch() {
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [rows, setRows] = useState(null)
  useEffect(() => {
    if (!q.trim()) { setRows(null); return }
    const t = setTimeout(() => api(`/api/concerts?q=${encodeURIComponent(q.trim())}`).then((r) => setRows(r.items)), 250)
    return () => clearTimeout(t)
  }, [q])
  return (
    <div className="page pt-4">
      <input className="input" autoFocus placeholder="Search artist, concert, city or venue" value={q} onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && nav(`/tg/explore?q=${encodeURIComponent(q)}`)} />
      <div className="mt-4 grid gap-4">
        {rows === null ? <p className="text-sm text-muted">Type to search concerts.</p> : rows.length ? rows.map((c) => <ConcertCard key={c.id} c={c} />) : <Empty title="No results" />}
      </div>
    </div>
  )
}

function TgProfile() {
  const { user, settings } = useApp()
  const support = settings?.telegram?.support_username
  return (
    <div className="page pt-5">
      <h1 className="text-2xl font-bold">{user.full_name}</h1>
      <p className="text-sm text-muted">{user.telegram_username ? `@${user.telegram_username}` : 'Telegram account'}{user.email && ` · ${user.email}`}</p>
      <div className="card mt-5 divide-y divide-line">
        {[['/tg/account', 'Profile & sign-in'], ['/tg/listings', 'My listings'], ['/tg/orders', 'My orders'], ['/tg/account/wallet', 'Wallet & withdrawals'], ['/tg/account/invoices', 'Invoices'], ['/tg/support', 'Support'], ['/tg/policies/refunds', 'Refund policy'], ['/tg/policies/authenticity', 'Ticket authenticity']]
          .map(([to, l]) => <Link key={to} to={to} className="flex items-center justify-between p-4 text-[15px] font-medium">{l}<span className="text-muted">›</span></Link>)}
      </div>
      {support && <button className="btn-ghost mt-5 w-full py-3" onClick={() => openExternal(`https://t.me/${support}`)}><MessageCircle className="h-4 w-4" />Message support</button>}
    </div>
  )
}

function Outside() {
  const { settings } = useApp()
  const url = settings?.telegram?.mini_app_url
  return (
    <div className="page flex min-h-screen flex-col items-center justify-center text-center">
      <Logo />
      <p className="mt-6 text-lg font-semibold">This is the TicketNest Telegram Mini App</p>
      <p className="mt-2 max-w-sm text-sm text-muted">Open it from Telegram, or use the website.</p>
      <div className="mt-6 flex gap-2">{url && <a href={url} className="btn-accent">Open in Telegram</a>}<Link to="/" className="btn-ghost">Go to website</Link></div>
    </div>
  )
}

export { Loading }
