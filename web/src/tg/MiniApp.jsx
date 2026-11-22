// The Telegram Mini App: same backend, same pages, Telegram-native shell.
// - signs in with Telegram's signed initData (validated on the server)
// - follows Telegram's light/dark theme, safe areas, BackButton, MainButton and haptics
// - bottom tab bar instead of the website header
import { MessageCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { ConcertCard } from '../components/cards'
import { Empty, Loading, Logo, Spinner } from '../components/ui'
import { BaseProvider, useApp } from '../context/App'
import { api } from '../lib/api'
import { cls } from '../lib/format'
import { haptic, inTelegram, openExternal, tg } from '../lib/telegram'
import Account, { MyInvoices, MyListings, MyOrders, MyWallet, Profile } from '../pages/account/Account'
import Checkout, { OrderPage, RequireAuth } from '../pages/Checkout'
import Concert, { Artist } from '../pages/Concert'
import Explore, { Artists } from '../pages/Explore'
import Home from '../pages/Home'
import TicketsPage from '../pages/Tickets'
import { TabBar } from '../components/Layout'
import { HowItWorks, Policy, Support } from '../pages/Info'
import { LANGS, useT } from '../i18n'
import { Avatar } from '../components/ui'
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
    const root = ['/tg', '/tg/', '/tg/explore', '/tg/concerts', '/tg/sell', '/tg/orders', '/tg/tickets', '/tg/profile'].includes(loc.pathname)
    const back = () => { haptic('light'); nav(-1) }
    root ? bb.hide() : bb.show()
    bb.onClick(back)
    return () => bb.offClick(back)
  }, [loc.pathname, nav])
}

export default function MiniApp() {
  const state = useTelegramShell()
  const { t } = useT()
  useBackButton()
  const loc = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [loc.pathname])
  if (state === 'outside') return <Outside />
  if (state === 'starting') return <div className="grid min-h-screen place-items-center"><Spinner className="h-6 w-6 text-muted" /></div>
  if (state === 'error') return <div className="page pt-16"><Empty title={t("Couldn't sign you in")}>{t('Close and reopen the app from the TicketNest bot. If it keeps happening, contact support.')}</Empty></div>
  const hideTabs = /\/(checkout|orders\/TN)/.test(loc.pathname)
  return (
    <BaseProvider value="/tg">
      <div className="min-h-screen pb-[calc(84px+var(--safe-bottom))] pt-[var(--safe-top)]">
        <Routes>
          <Route index element={<><Home /><ReviewsGap /></>} />
          <Route path="explore" element={<Explore compact />} />
          <Route path="concerts" element={<Explore compact />} />
          <Route path="artists" element={<Artists />} />
          <Route path="tickets" element={<RequireAuth><TicketsPage /></RequireAuth>} />
          <Route path="how-it-works" element={<HowItWorks />} />
          <Route path="search" element={<TgSearch />} />
          <Route path="concerts/:slug" element={<Concert />} />
          <Route path="artists/:slug" element={<Artist />} />
          <Route path="checkout/:listingId" element={<RequireAuth><Checkout /></RequireAuth>} />
          <Route path="orders/:number" element={<RequireAuth><OrderPage /></RequireAuth>} />
          <Route path="sell" element={<RequireAuth><Sell /></RequireAuth>} />
          <Route path="orders" element={<RequireAuth><TicketsPage /></RequireAuth>} />
          <Route path="listings" element={<RequireAuth><div className="page pt-5"><h1 className="mb-4 text-2xl font-bold">{t('My listings')}</h1><MyListings /></div></RequireAuth>} />
          <Route path="account" element={<RequireAuth><Account /></RequireAuth>}>
            <Route index element={<Profile />} /><Route path="orders" element={<MyOrders />} /><Route path="listings" element={<MyListings />} />
            <Route path="wallet" element={<MyWallet />} /><Route path="invoices" element={<MyInvoices />} />
          </Route>
          <Route path="profile" element={<RequireAuth><TgProfile /></RequireAuth>} />
          <Route path="support" element={<Support />} />
          <Route path="policies/:slug" element={<Policy />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </div>
      {!hideTabs && <TabBar tg />}
    </BaseProvider>
  )
}

function TgSearch() {
  const nav = useNavigate()
  const { t } = useT()
  const [q, setQ] = useState('')
  const [rows, setRows] = useState(null)
  useEffect(() => {
    if (!q.trim()) { setRows(null); return }
    const t = setTimeout(() => api(`/api/concerts?q=${encodeURIComponent(q.trim())}`).then((r) => setRows(r.items)), 250)
    return () => clearTimeout(t)
  }, [q])
  return (
    <div className="page pt-4">
      <input className="input" autoFocus placeholder={t('Search artist, concert, city or venue')} value={q} onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && nav(`/tg/explore?q=${encodeURIComponent(q)}`)} />
      <div className="mt-4 grid gap-4">
        {rows === null ? <p className="text-sm text-muted">{t('Type to search concerts.')}</p> : rows.length ? rows.map((c) => <ConcertCard key={c.id} c={c} />) : <Empty title={t('No results')} />}
      </div>
    </div>
  )
}

function TgProfile() {
  const { user, settings } = useApp()
  const { t, lang, setLang } = useT()
  const support = settings?.telegram?.support_username
  return (
    <div className="page pt-5">
      <div className="flex items-center gap-4"><Avatar user={user} size={56} />
        <div><h1 className="text-2xl font-bold">{user.full_name}</h1>
          <p className="text-sm text-muted">{user.telegram_username ? `@${user.telegram_username}` : t('Telegram account')}{user.email && ` · ${user.email}`}</p></div></div>
      <div className="mt-5 grid grid-cols-3 gap-2">
        {LANGS.map((l) => <button key={l.code} onClick={() => setLang(l.code)} className={cls('rounded-xl border px-3 py-2.5 text-sm font-semibold transition', lang === l.code ? 'border-accent bg-accent/10 text-accent' : 'border-line')}>{l.label}</button>)}
      </div>
      <div className="card mt-5 divide-y divide-line">
        {[['/tg/account', 'Profile & settings'], ['/tg/listings', 'My listings'], ['/tg/tickets', 'My tickets'], ['/tg/account/wallet', 'Wallet & withdrawals'], ['/tg/account/invoices', 'Invoices'], ['/tg/support', 'Support'], ['/tg/policies/refunds', 'Refund policy'], ['/tg/policies/authenticity', 'Ticket authenticity']]
          .map(([to, l]) => <Link key={to} to={to} className="flex items-center justify-between p-4 text-[15px] font-medium transition active:bg-raised">{t(l)}<span className="text-muted">›</span></Link>)}
      </div>
      {support && <button className="btn-ghost mt-5 w-full py-3" onClick={() => openExternal(`https://t.me/${support}`)}><MessageCircle className="h-4 w-4" />{t('Message support')}</button>}
    </div>
  )
}

function Outside() {
  const { settings } = useApp()
  const { t } = useT()
  const url = settings?.telegram?.mini_app_url
  return (
    <div className="page flex min-h-screen flex-col items-center justify-center text-center">
      <Logo />
      <p className="mt-6 text-lg font-semibold">{t('This is the TicketNest Telegram Mini App')}</p>
      <p className="mt-2 max-w-sm text-sm text-muted">{t('Open it from Telegram, or use the website.')}</p>
      <div className="mt-6 flex gap-2">{url && <a href={url} className="btn-accent">{t('Open in Telegram')}</a>}<Link to="/" className="btn-ghost">{t('Go to website')}</Link></div>
    </div>
  )
}

export { Loading }

// the website home already ends with the reviews slider; this only adds breathing room above the tab bar
function ReviewsGap() { return <div className="h-6" /> }
