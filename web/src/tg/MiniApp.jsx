// The Telegram Mini App: same backend, same pages, Telegram-native shell.
// - signs in with Telegram's signed initData (validated on the server)
// - follows Telegram's light/dark theme, safe areas, BackButton, MainButton and haptics
// - bottom tab bar instead of the website header
import { ChevronRight, FileText, LifeBuoy, MessageCircle, Pencil, RotateCcw, Shield, ShieldCheck, Sparkles, Tag, Ticket, UserCog, Wallet } from 'lucide-react'
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
  const [stats, setStats] = useState(null)
  useEffect(() => {
    Promise.all([api('/api/orders').catch(() => []), api('/api/sell/dashboard').catch(() => null)])
      .then(([orders, dash]) => setStats({
        tickets: orders.filter((o) => !['cancelled', 'refunded'].includes(o.status)).reduce((n, o) => n + (o.item?.quantity || 0), 0),
        listings: dash?.total_listings ?? 0,
        wallet: dash?.wallet?.available_cents ?? 0,
        pending: dash?.wallet?.pending_cents ?? 0,
      }))
  }, [])
  const support = settings?.telegram?.support_username
  const staff = user.role !== 'customer'
  const money = (c) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const groups = [
    [t('Activity'), [
      ['/tg/tickets', Ticket, t('My tickets'), 'bg-[#8B5CF6]', stats?.tickets ? String(stats.tickets) : ''],
      ['/tg/listings', Tag, t('My listings'), 'bg-[#EC4899]', stats?.listings ? String(stats.listings) : ''],
      ['/tg/account/wallet', Wallet, t('Wallet & withdrawals'), 'bg-[#10B981]', stats ? money(stats.wallet) : ''],
      ['/tg/account/invoices', FileText, t('Invoices'), 'bg-[#3B82F6]', ''],
    ]],
    [t('Account'), [
      ['/tg/account', UserCog, t('Profile & settings'), 'bg-[#64748B]', ''],
      ...(staff ? [['/admin', Shield, t('Admin dashboard'), 'bg-[#F59E0B]', '']] : []),
    ]],
    [t('Help'), [
      ['/tg/how-it-works', Sparkles, t('How it works'), 'bg-[#06B6D4]', ''],
      ['/tg/policies/refunds', RotateCcw, t('Refund policy'), 'bg-[#F43F5E]', ''],
      ['/tg/policies/authenticity', ShieldCheck, t('Ticket authenticity'), 'bg-[#22C55E]', ''],
      ['/tg/support', LifeBuoy, t('Support'), 'bg-[#A855F7]', ''],
    ]],
  ]
  return (
    <div className="page max-w-lg pb-6 pt-3">
      {/* identity card */}
      <section className="relative overflow-hidden rounded-[28px] border border-line bg-surface shadow-card">
        <div className="holo-bg absolute inset-x-0 top-0 h-24 opacity-90" />
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-transparent to-black/10" />
        <div className="relative px-5 pb-5 pt-12">
          <div className="flex items-end justify-between gap-3">
            <div className="rounded-full bg-surface p-1 shadow-card"><Avatar user={user} size={76} /></div>
            <Link to="/tg/account" onClick={() => haptic('light')} className="mb-1 inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 py-1.5 text-[13px] font-semibold transition active:scale-95">
              <Pencil className="h-3.5 w-3.5" />{t('Edit')}
            </Link>
          </div>
          <h1 className="mt-3 flex items-center gap-2 text-[22px] font-bold leading-tight">
            <span className="truncate">{user.full_name}</span>
            {staff && <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wider text-accent">{t(user.role === 'admin' ? 'Admin' : 'Staff')}</span>}
          </h1>
          <p className="mt-0.5 truncate text-[13.5px] text-muted">{user.telegram_username ? `@${user.telegram_username}` : t('Telegram account')}{user.email ? ` · ${user.email}` : ''}</p>
          {/* quick stats */}
          <div className="mt-4 grid grid-cols-3 divide-x divide-line rounded-2xl bg-raised py-3 text-center">
            {[[t('Tickets'), stats ? stats.tickets : '–', '/tg/tickets'], [t('Listings'), stats ? stats.listings : '–', '/tg/listings'], [t('Wallet'), stats ? money(stats.wallet) : '–', '/tg/account/wallet']].map(([l, v, to]) => (
              <Link key={l} to={to} onClick={() => haptic('light')} className="px-1 transition active:opacity-60">
                <p className="truncate font-display text-[17px] font-bold tabular-nums">{v}</p>
                <p className="text-[11.5px] font-medium text-muted">{l}</p>
              </Link>
            ))}
          </div>
          {stats?.pending > 0 && <p className="mt-2 text-center text-[12px] text-muted">{t('{amount} pending until buyers receive their tickets', { amount: money(stats.pending) })}</p>}
        </div>
      </section>

      {/* language */}
      <p className="mb-2 ml-4 mt-6 text-[12px] font-semibold uppercase tracking-[.12em] text-muted">{t('Language')}</p>
      <div className="grid grid-cols-3 gap-1 rounded-2xl border border-line bg-surface p-1">
        {LANGS.map((l) => (
          <button key={l.code} onClick={() => { haptic('light'); setLang(l.code) }} aria-pressed={lang === l.code}
            className={cls('rounded-xl py-2.5 text-[14px] font-semibold transition', lang === l.code ? 'bg-ink text-bg shadow-card' : 'text-muted active:bg-raised')}>
            {l.label}
          </button>
        ))}
      </div>

      {/* grouped menus, iOS-settings style */}
      {groups.map(([title, rows]) => (
        <div key={title}>
          <p className="mb-2 ml-4 mt-6 text-[12px] font-semibold uppercase tracking-[.12em] text-muted">{title}</p>
          <div className="overflow-hidden rounded-2xl border border-line bg-surface">
            {rows.map(([to, Icon, label, tone, value], i) => (
              <Link key={to} to={to} onClick={() => haptic('light')}
                className="flex items-center gap-3.5 px-4 py-3 transition active:bg-raised">
                <span className={cls('grid h-8 w-8 shrink-0 place-items-center rounded-[10px] text-white', tone)}><Icon className="h-[17px] w-[17px]" strokeWidth={2.2} /></span>
                <span className={cls('flex min-w-0 flex-1 items-center gap-2 self-stretch py-0.5', i > 0 && '-mt-3 border-t border-line pt-3')}>
                  <span className="flex-1 truncate text-[15px] font-medium">{label}</span>
                  {value && <span className="text-[14px] tabular-nums text-muted">{value}</span>}
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted/70" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      ))}

      {support && (
        <button onClick={() => { haptic('light'); openExternal(`https://t.me/${support}`) }}
          className="btn-holo mt-6 w-full py-3.5 text-[15px]"><MessageCircle className="h-[18px] w-[18px]" />{t('Message support')}</button>
      )}
      <p className="mt-6 text-center text-[11.5px] text-muted">TicketNest · {t('Independent resale marketplace, not affiliated with any artist or official seller.')}</p>
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
