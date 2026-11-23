import { Camera, Check, ChevronLeft, CreditCard, FileText, Globe, Info, KeyRound, LogOut, Pencil, QrCode, Receipt, Shield, Ticket, Trash2, Upload, User, Wallet, X } from 'lucide-react'
import { confirmDialog } from '../../components/Dialog'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { GoogleButton, TelegramButton } from '../../components/SocialSignIn'
import AccountMenu from '../../components/AccountMenu'
import { Avatar, Empty, ErrorNote, Field, ListingBadge, Loading, Modal, OrderBadge, PasswordInput, Spinner, Stat } from '../../components/ui'
import { useApp, useLink } from '../../context/App'
import { LANGS, useT } from '../../i18n'
import { api } from '../../lib/api'
import { cls, dateLong, dateShort, dateTime, usd2 } from '../../lib/format'
import { inTelegram } from '../../lib/telegram'
import { openFile } from '../../lib/api'

const TITLES = { settings: 'Profile & settings', listings: 'My listings', wallet: 'Wallet & withdrawals', invoices: 'Invoices', orders: 'My orders' }
export const PAYOUT_NOTE = 'You are paid after the concert, not when a buyer buys your ticket. Your earnings (listing price minus commission) reach your wallet 24 to 48 hours after the concert ends, once the buyer has the ticket and has not reported a problem. You can then request a withdrawal.'

export default function Account() {
  const { t } = useT()
  const link = useLink()
  const loc = useLocation()
  const sub = loc.pathname.replace(/^.*\/account\/?/, '').split('/')[0]
  if (!sub) {
    return <div className="page max-w-2xl pb-6 pt-4 sm:pt-8"><AccountMenu /></div>
  }
  return (
    <div className="page max-w-3xl pt-4 sm:pt-8">
      <Link to={link('/account')} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface py-1.5 pl-2 pr-3.5 text-[13px] font-semibold text-muted transition hover:text-ink active:scale-95">
        <ChevronLeft className="h-4 w-4" />{t('Account')}
      </Link>
      <h1 className="rise mt-3 text-[26px] font-bold leading-tight sm:text-3xl">{t(TITLES[sub] || 'Account')}</h1>
      <div className="mt-5"><Outlet /></div>
    </div>
  )
}

function Section({ icon: Icon, title, sub, children, action }) {
  return (
    <section className="card rise overflow-hidden">
      <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent"><Icon className="h-[18px] w-[18px]" /></span>
          <div><p className="font-semibold">{title}</p>{sub && <p className="mt-0.5 text-[13px] text-muted">{sub}</p>}</div>
        </div>
        {action}
      </div>
      <div className="p-5 sm:p-6">{children}</div>
    </section>
  )
}

export function Profile() {
  const { user, setUser, toast, dark, applyTheme } = useApp()
  const { t, lang, setLang } = useT()
  const [f, setF] = useState({ full_name: user.full_name, email: user.email || '', phone: user.phone || '', telegram_username: user.telegram_username || '' })
  const [p, setP] = useState({ payout_method: user.payout?.method || 'ABA', payout_account_name: user.payout?.account_name || '', payout_account_number: user.payout?.account_number || '' })
  const [busy, setBusy] = useState('')
  const [error, setError] = useState(null)
  const [pwOpen, setPwOpen] = useState(false)
  const avatarIn = useRef(null)
  const qrIn = useRef(null)
  const dirty = f.full_name !== user.full_name || f.email !== (user.email || '') || f.phone !== (user.phone || '') || f.telegram_username !== (user.telegram_username || '')

  const save = async (body, key) => {
    setBusy(key); setError(null)
    try { setUser(await api('/api/account/me', { method: 'PATCH', body })); toast(t('Saved')) } catch (err) { setError(err); toast(err.message, 'error') } finally { setBusy('') }
  }
  const upload = async (path, file, key) => {
    if (!file) return
    setBusy(key)
    const fd = new FormData(); fd.append('file', file)
    try { setUser(await api(path, { method: 'POST', form: fd })); toast(t('Saved')) } catch (err) { toast(err.message, 'error') } finally { setBusy('') }
  }
  const linked = (u) => { setUser(u.user || u); toast(t('Account linked')) }
  const unlink = async (prov) => { try { setUser(await api(`/api/account/link/${prov}`, { method: 'DELETE' })); toast(t('Disconnected')) } catch (e) { toast(e.message, 'error') } }
  const changeLang = (l) => { setLang(l); api('/api/account/me', { method: 'PATCH', body: { locale: l } }).then(setUser).catch(() => {}) }
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        <Section icon={User} title={t('Personal information')} sub={t('How we contact you about orders and deliveries.')}>
          <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
            <button type="button" onClick={() => avatarIn.current?.click()} className="group relative shrink-0 rounded-full" aria-label={t('Change photo')}>
              <Avatar user={user} size={96} className="ring-4 ring-bg transition group-hover:brightness-75" />
              <span className="absolute inset-0 grid place-items-center rounded-full bg-black/40 text-white opacity-0 transition group-hover:opacity-100">
                {busy === 'avatar' ? <Spinner /> : <Camera className="h-6 w-6" />}
              </span>
              <span className="absolute bottom-0 right-0 grid h-8 w-8 place-items-center rounded-full border-2 border-surface bg-accent text-accent-ink shadow"><Camera className="h-4 w-4" /></span>
            </button>
            <input ref={avatarIn} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => { upload('/api/account/avatar', e.target.files[0], 'avatar'); e.target.value = '' }} />
            <div className="text-center sm:text-left">
              <p className="text-lg font-semibold">{user.full_name}</p>
              <p className="text-sm text-muted">{t('Member since {date}', { date: dateLong(user.created_at) })}</p>
              <div className="mt-2 flex justify-center gap-2 sm:justify-start">
                <button className="btn-ghost py-1.5 text-[13px]" onClick={() => avatarIn.current?.click()}><Upload className="h-3.5 w-3.5" />{t('Upload photo')}</button>
                {user.avatar_url && <button className="btn-ghost py-1.5 text-[13px]" onClick={async () => setUser(await api('/api/account/avatar', { method: 'DELETE' }))}><Trash2 className="h-3.5 w-3.5" />{t('Remove')}</button>}
              </div>
            </div>
          </div>
          <form className="mt-6 grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save({ ...f, email: f.email || null }, 'info') }}>
            <Field label={t('Full name')}><input className="input" value={f.full_name} onChange={set('full_name')} /></Field>
            <Field label={t('Email')} hint={user.email && !user.email_verified ? t('Not verified yet') : ''}><input className="input" type="email" value={f.email} onChange={set('email')} /></Field>
            <Field label={t('Phone number')}><input className="input" inputMode="tel" value={f.phone} onChange={set('phone')} placeholder="012 345 678" /></Field>
            <Field label={t('Telegram username')} hint={t('Used to deliver your tickets')}><input className="input" value={f.telegram_username} onChange={set('telegram_username')} placeholder="@username" /></Field>
            <div className="flex items-center gap-3 sm:col-span-2">
              <button className="btn-primary" disabled={!dirty || busy === 'info'}>{busy === 'info' ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />}{t('Save changes')}</button>
              {dirty && <button type="button" className="text-sm text-muted hover:text-ink" onClick={() => setF({ full_name: user.full_name, email: user.email || '', phone: user.phone || '', telegram_username: user.telegram_username || '' })}>{t('Cancel')}</button>}
            </div>
            <ErrorNote error={error} />
          </form>
        </Section>

        <Section icon={CreditCard} title={t('Payout details')} sub={t('Where we send your earnings when you sell tickets.')}>
          <p className="mb-5 flex gap-2 rounded-xl bg-accent/5 p-3.5 text-[13px] leading-relaxed text-muted"><Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" />{t(PAYOUT_NOTE)}</p>
          <form className="grid gap-4 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); save(p, 'payout') }}>
            <Field label={t('Bank / wallet')}><select className="input" value={p.payout_method} onChange={(e) => setP({ ...p, payout_method: e.target.value })}>{['ABA', 'ACLEDA', 'Wing', 'Bakong', 'Other bank'].map((m) => <option key={m}>{m}</option>)}</select></Field>
            <Field label={t('Account name')}><input className="input" value={p.payout_account_name} onChange={(e) => setP({ ...p, payout_account_name: e.target.value })} /></Field>
            <Field label={t('Account number')}><input className="input" inputMode="numeric" value={p.payout_account_number} onChange={(e) => setP({ ...p, payout_account_number: e.target.value })} /></Field>
            <div className="sm:col-span-3"><button className="btn-ghost" disabled={busy === 'payout'}>{busy === 'payout' && <Spinner className="h-4 w-4" />}{t('Save payout details')}</button></div>
          </form>
          <div className="mt-5 flex flex-col gap-4 rounded-2xl border border-dashed border-line p-4 sm:flex-row sm:items-center">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-raised"><QrCode className="h-6 w-6 text-muted" /></span>
            <div className="flex-1">
              <p className="text-sm font-semibold">{t('Your bank KHQR')} {user.payout?.has_qr && <span className="ml-1 text-good">✓ {t('Uploaded')}</span>}</p>
              <p className="text-[13px] text-muted">{t('Upload your own ABA / Bakong QR so we can pay you in one scan. Only TicketNest admins can see it.')}</p>
            </div>
            <div className="flex gap-2">
              {user.payout?.has_qr && <button className="btn-ghost py-2" onClick={() => openFile('/api/account/payout-qr', 'payout-qr.png')}>{t('View')}</button>}
              <button className="btn-accent py-2" onClick={() => qrIn.current?.click()} disabled={busy === 'qr'}>{busy === 'qr' ? <Spinner className="h-4 w-4" /> : <Upload className="h-4 w-4" />}{user.payout?.has_qr ? t('Replace') : t('Upload QR')}</button>
            </div>
            <input ref={qrIn} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => { upload('/api/account/payout-qr', e.target.files[0], 'qr'); e.target.value = '' }} />
          </div>
        </Section>
      </div>

      <div className="space-y-6">
        <Section icon={Globe} title={t('Language & appearance')}>
          <div className="grid grid-cols-3 gap-2">
            {LANGS.map((l) => (
              <button key={l.code} onClick={() => changeLang(l.code)}
                className={cls('rounded-xl border px-3 py-2.5 text-sm font-semibold transition-all', lang === l.code ? 'border-accent bg-accent/10 text-accent' : 'border-line hover:border-ink/20')}>{l.label}</button>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {[[false, t('Light')], [true, t('Dark')]].map(([d, l]) => (
              <button key={l} onClick={() => applyTheme(d)} className={cls('rounded-xl border px-3 py-2.5 text-sm font-semibold transition-all', dark === d ? 'border-accent bg-accent/10 text-accent' : 'border-line hover:border-ink/20')}>{l}</button>
            ))}
          </div>
        </Section>

        <Section icon={KeyRound} title={t('Sign-in & security')}>
          <div className="space-y-3">
            <Conn name={t('Password')} on={user.has_password} detail={user.has_password ? '••••••••' : t('Not set')}
              action={<button className="text-[13px] font-semibold text-accent" onClick={() => setPwOpen(true)}>{user.has_password ? t('Change') : t('Set password')}</button>} />
            <Conn name="Google" on={user.providers.includes('google')} detail={user.providers.includes('google') ? t('Connected') : t('Not connected')}
              action={user.providers.includes('google') && <button onClick={() => unlink('google')} className="text-[13px] font-medium text-muted hover:text-bad">{t('Disconnect')}</button>}>
              {!user.providers.includes('google') && <GoogleButton mode="link" label={t('Connect Google')} onDone={linked} />}
            </Conn>
            <Conn name="Telegram" on={!!user.telegram_id} detail={user.telegram_username ? `@${user.telegram_username}` : user.telegram_id ? t('Connected') : t('Not connected')}
              action={user.telegram_id && <button onClick={() => unlink('telegram')} className="text-[13px] font-medium text-muted hover:text-bad">{t('Disconnect')}</button>}>
              {!user.telegram_id && <TelegramButton mode="link" label={t('Connect Telegram')} onDone={linked} />}
            </Conn>
          </div>
        </Section>
      </div>
      <PasswordModal open={pwOpen} onClose={() => setPwOpen(false)} hasPassword={user.has_password} onDone={() => { setUser({ ...user, has_password: true }); toast(t('Password saved')) }} />
    </div>
  )
}

function Conn({ name, on, detail, action, children }) {
  return (
    <div className="rounded-2xl border border-line p-3.5 transition hover:border-ink/15">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={cls('h-2.5 w-2.5 rounded-full', on ? 'bg-good' : 'bg-line')} />
          <div><p className="text-sm font-semibold">{name}</p><p className="text-[12px] text-muted">{detail}</p></div>
        </div>
        {action}
      </div>
      {children && <div className="mt-3">{children}</div>}
    </div>
  )
}

function PasswordModal({ open, onClose, hasPassword, onDone }) {
  const { t } = useT()
  const [cur, setCur] = useState('')
  const [pw, setPw] = useState('')
  const [error, setError] = useState(null)
  const submit = async (e) => {
    e.preventDefault(); setError(null)
    try { await api('/api/account/password', { method: 'POST', body: { current_password: cur, new_password: pw } }); onDone(); onClose() } catch (err) { setError(err) }
  }
  return (
    <Modal open={open} onClose={onClose} title={hasPassword ? t('Change password') : t('Set a password')}>
      <form onSubmit={submit} className="space-y-4">
        {hasPassword && <Field label={t('Current password')}><PasswordInput value={cur} onChange={(e) => setCur(e.target.value)} /></Field>}
        <Field label={t('New password')} hint={t('At least 8 characters, with letters and numbers')}><PasswordInput autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
        <ErrorNote error={error} />
        <button className="btn-primary w-full">{t('Save password')}</button>
      </form>
    </Modal>
  )
}

export function MyOrders() {
  const { t } = useT()
  const link = useLink()
  const [rows, setRows] = useState(null)
  useEffect(() => { api('/api/orders').then(setRows).catch(() => setRows([])) }, [])
  if (!rows) return <Loading />
  if (!rows.length) return <Empty icon={Ticket} title={t('No orders yet')} action={<Link to={link('/concerts')} className="btn-primary">{t('Find tickets')}</Link>}>{t('Tickets you buy will show up here with their delivery status.')}</Empty>
  return (
    <div className="card rise divide-y divide-line overflow-hidden">
      {rows.map((o) => (
        <Link key={o.id} to={link(`/orders/${o.order_number}`)} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4 transition hover:bg-raised">
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{o.item.concert_title}</p>
            <p className="text-[13px] text-muted">{o.order_number} · {o.item.category_name} × {o.item.quantity} · {dateShort(o.item.concert_starts_at)}</p>
          </div>
          <OrderBadge status={o.status} />
          <span className="w-20 text-right font-semibold tabular-nums">{usd2(o.total_cents)}</span>
        </Link>
      ))}
    </div>
  )
}

export function MyListings() {
  const { t } = useT()
  const link = useLink()
  const { toast } = useApp()
  const [rows, setRows] = useState(null)
  const [dash, setDash] = useState(null)
  const [edit, setEdit] = useState(null)
  const load = useCallback(() => {
    api('/api/sell/listings').then(setRows).catch(() => setRows([]))
    api('/api/sell/dashboard').then(setDash).catch(() => {})
  }, [])
  useEffect(() => { load() }, [load])
  const cancel = async (l) => {
    if (!(await confirmDialog({ title: t('Cancel this listing?'), message: t('It will be removed from sale.'), confirmText: t('Cancel listing'), cancelText: t('Keep listing'), danger: true }))) return
    try { await api(`/api/sell/listings/${l.id}/cancel`, { method: 'POST' }); toast(t('Listing cancelled')); load() } catch (e) { toast(e.message, 'error') }
  }
  if (!rows) return <Loading />
  return (
    <div className="space-y-6">
      {dash && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label={t('Total listings')} value={dash.total_listings} hint={t('{n} pending', { n: dash.pending_listings })} />
          <Stat label={t('Tickets on sale')} value={dash.available_tickets} hint={t('{n} sold', { n: dash.sold_tickets })} />
          <Stat label={t('Gross sales')} value={usd2(dash.gross_sales_cents)} hint={`${t('Commission')} ${usd2(dash.commission_cents)}`} />
          <Stat label={t('Net earnings')} value={usd2(dash.net_earnings_cents)} hint={t('{a} withdrawal(s) pending · {b} paid', { a: dash.pending_withdrawals, b: dash.completed_withdrawals })} />
        </div>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex gap-2 text-[13px] text-muted"><Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" />{t(PAYOUT_NOTE)}</p>
        <Link to={link('/sell')} className="btn-accent shrink-0">{t('List tickets')}</Link>
      </div>
      {!rows.length ? <Empty icon={Ticket} title={t('No listings yet')}>{t("Can't make a show? List your tickets and we'll handle the sale.")}</Empty> : (
        <div className="space-y-3">
          {rows.map((l) => (
            <div key={l.id} className="card card-hover p-4">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{l.concert.title}</p>
                  <p className="text-[13px] text-muted">#{l.id} · {l.category}{l.seat_info && ` · ${l.seat_info}`} · {dateLong(l.concert.starts_at)}</p>
                </div>
                <ListingBadge status={l.status} />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
                <span><span className="text-muted">{t('Price')}</span> <b>{usd2(l.price_cents)}</b></span>
                <span><span className="text-muted">{t('You get')}</span> <b>{usd2(l.net_per_ticket_cents)}</b>/{t('ticket')}</span>
                <span><span className="text-muted">{t('Sold')}</span> <b>{l.quantity_sold}/{l.quantity}</b></span>
                {l.quantity_reserved > 0 && <span className="text-accent">{t('{n} on hold', { n: l.quantity_reserved })}</span>}
              </div>
              {l.status === 'rejected' && l.rejection_reason && <p className="mt-3 rounded-xl bg-bad/5 p-3 text-[13px] text-bad">{t('Reason')}: {l.rejection_reason}</p>}
              {(l.can_edit || l.can_cancel) && (
                <div className="mt-3 flex gap-2">
                  {l.can_edit && <button className="btn-ghost py-2" onClick={() => setEdit(l)}><Pencil className="h-4 w-4" />{t('Edit')}</button>}
                  {l.can_cancel && <button className="btn-ghost py-2" onClick={() => cancel(l)}><X className="h-4 w-4" />{t('Cancel')}</button>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <EditListing l={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); toast(t('Saved — your listing is back in review')) }} />
    </div>
  )
}

function EditListing({ l, onClose, onSaved }) {
  const { t } = useT()
  const [f, setF] = useState({})
  const [error, setError] = useState(null)
  useEffect(() => { if (l) setF({ price: (l.price_cents / 100).toString(), quantity: l.quantity, seat_info: l.seat_info, notes: l.notes }) }, [l])
  if (!l) return null
  const save = async (e) => {
    e.preventDefault(); setError(null)
    try { await api(`/api/sell/listings/${l.id}`, { method: 'PATCH', body: f }); onSaved() } catch (err) { setError(err) }
  }
  return (
    <Modal open onClose={onClose} title={t('Edit listing #{id}', { id: l.id })}>
      <form onSubmit={save} className="space-y-4">
        <p className="text-sm text-muted">{t('Changes are reviewed again before the listing goes back on sale.')}</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('Price (USD)')}><input className="input" inputMode="decimal" value={f.price || ''} onChange={(e) => setF({ ...f, price: e.target.value })} /></Field>
          <Field label={t('Quantity')}><input className="input" type="number" min={Math.max(1, l.quantity_sold)} value={f.quantity || 1} onChange={(e) => setF({ ...f, quantity: Number(e.target.value) })} /></Field>
        </div>
        <Field label={t('Seat')}><input className="input" value={f.seat_info || ''} onChange={(e) => setF({ ...f, seat_info: e.target.value })} /></Field>
        <Field label={t('Notes')}><textarea className="input" value={f.notes || ''} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        <ErrorNote error={error} />
        <button className="btn-primary w-full">{t('Save')}</button>
      </form>
    </Modal>
  )
}

const TX = { sale_pending: 'Sale (pending delivery)', sale_released: 'Earnings released', sale_reversed: 'Refund reversal',
  withdrawal_hold: 'Withdrawal requested', withdrawal_paid: 'Withdrawal paid', withdrawal_returned: 'Withdrawal returned', adjustment: 'Adjustment' }

export function MyWallet() {
  const { t } = useT()
  const { toast, user } = useApp()
  const [w, setW] = useState(null)
  const [wds, setWds] = useState([])
  const [open, setOpen] = useState(false)
  const load = useCallback(() => { api('/api/account/wallet').then(setW); api('/api/account/withdrawals').then(setWds) }, [])
  useEffect(() => { load() }, [load])
  if (!w) return <Loading />
  return (
    <div className="space-y-6">
      <div className="rise relative overflow-hidden rounded-3xl bg-ink p-6 text-bg sm:p-8">
        <div className="glow absolute -right-16 -top-16 h-56 w-56 rounded-full bg-accent/50 blur-3xl" />
        <p className="relative text-sm text-bg/60">{t('Available to withdraw')}</p>
        <p className="relative mt-1 font-display text-4xl font-bold tabular-nums">{usd2(w.available_cents)}</p>
        <div className="relative mt-5 flex flex-wrap items-center gap-3">
          <button className="btn bg-bg text-ink hover:shadow-lift" disabled={w.available_cents < w.min_withdrawal_cents} onClick={() => setOpen(true)}><Wallet className="h-4 w-4" />{t('Request withdrawal')}</button>
          {w.available_cents < w.min_withdrawal_cents && <span className="text-[13px] text-bg/60">{t('Minimum withdrawal is {amount}.', { amount: usd2(w.min_withdrawal_cents) })}</span>}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Stat label={t('Pending delivery')} value={usd2(w.pending_cents)} hint={t('Released after the concert, once the buyer has the ticket')} />
        <Stat label={t('In withdrawal')} value={usd2(w.held_cents)} />
        <Stat label={t('Paid out')} value={usd2(w.withdrawn_cents)} />
      </div>
      <p className="flex gap-2 rounded-xl bg-accent/5 p-3.5 text-[13px] text-muted"><Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" />{t(PAYOUT_NOTE)}</p>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <p className="font-semibold">{t('Withdrawals')}</p>
          {!wds.length ? <p className="mt-3 text-sm text-muted">{t('No withdrawals yet.')}</p> : wds.map((x) => (
            <div key={x.id} className="flex items-center justify-between gap-3 border-t border-line py-3 text-sm first:mt-3">
              <div><p className="font-medium">#{x.id} · {x.method} {x.account_number}</p><p className="text-[12px] text-muted">{dateTime(x.created_at)}{x.admin_note && ` · ${x.admin_note}`}</p></div>
              <div className="text-right"><p className="font-semibold">{usd2(x.amount_cents)}</p><p className={cls('text-[12px] font-semibold', x.status === 'paid' ? 'text-good' : x.status === 'pending' ? 'text-warn' : 'text-muted')}>{t(x.status)}</p></div>
            </div>
          ))}
        </div>
        <div className="card p-5">
          <p className="font-semibold">{t('Wallet activity')}</p>
          {!w.transactions.length ? <p className="mt-3 text-sm text-muted">{t('Sales and payouts will appear here.')}</p> : w.transactions.map((x) => (
            <div key={x.id} className="flex items-center justify-between gap-3 border-t border-line py-3 text-sm first:mt-3">
              <div><p className="font-medium">{t(TX[x.type] || x.type)}</p><p className="text-[12px] text-muted">{x.note} · {dateTime(x.created_at)}</p></div>
              <span className="font-semibold tabular-nums">{usd2(x.amount_cents)}</span>
            </div>
          ))}
        </div>
      </div>
      <WithdrawModal open={open} onClose={() => setOpen(false)} max={w.available_cents} user={user} onDone={() => { setOpen(false); toast(t('Withdrawal requested. We will pay it to your account after review.')); load() }} />
    </div>
  )
}

function WithdrawModal({ open, onClose, max, user, onDone }) {
  const { t } = useT()
  const [f, setF] = useState({ amount: '', method: user?.payout?.method || 'ABA', account_name: user?.payout?.account_name || '', account_number: user?.payout?.account_number || '' })
  const [error, setError] = useState(null)
  const submit = async (e) => {
    e.preventDefault(); setError(null)
    try { await api('/api/account/withdrawals', { method: 'POST', body: f }); onDone() } catch (err) { setError(err) }
  }
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  return (
    <Modal open={open} onClose={onClose} title={t('Request a withdrawal')}>
      <form onSubmit={submit} className="space-y-4">
        <Field label={t('Amount (max {amount})', { amount: usd2(max) })}>
          <div className="flex gap-2"><input className="input" inputMode="decimal" value={f.amount} onChange={set('amount')} placeholder={(max / 100).toFixed(2)} />
            <button type="button" className="btn-ghost" onClick={() => setF({ ...f, amount: (max / 100).toFixed(2) })}>{t('Max')}</button></div>
        </Field>
        <Field label={t('Bank / wallet')}><select className="input" value={f.method} onChange={set('method')}>{['ABA', 'ACLEDA', 'Wing', 'Bakong', 'Other bank'].map((m) => <option key={m}>{m}</option>)}</select></Field>
        <Field label={t('Account name')}><input className="input" value={f.account_name} onChange={set('account_name')} /></Field>
        <Field label={t('Account number')}><input className="input" inputMode="numeric" value={f.account_number} onChange={set('account_number')} /></Field>
        {!user?.payout?.has_qr && <p className="text-[12px] text-muted">{t('Tip: upload your bank QR in Profile → Payout details so we can pay you faster.')}</p>}
        <p className="text-[12px] text-muted">{t('Withdrawals are reviewed and paid manually by TicketNest, usually within 1–2 business days.')}</p>
        <ErrorNote error={error} />
        <button className="btn-primary w-full">{t('Request withdrawal')}</button>
      </form>
    </Modal>
  )
}

export function MyInvoices() {
  const { t } = useT()
  const [rows, setRows] = useState(null)
  useEffect(() => { api('/api/account/invoices').then(setRows).catch(() => setRows([])) }, [])
  if (!rows) return <Loading />
  if (!rows.length) return <Empty icon={Receipt} title={t('No invoices yet')}>{t('An invoice is issued for every order once its payment is verified.')}</Empty>
  return (
    <div className="card rise divide-y divide-line overflow-hidden">
      {rows.map((r) => (
        <div key={r.invoice_number} className="flex flex-wrap items-center gap-3 p-4">
          <FileText className="h-5 w-5 text-muted" />
          <div className="min-w-0 flex-1"><p className="font-semibold">{r.invoice_number}</p><p className="truncate text-[13px] text-muted">{r.order_number} · {r.concert_title} · {dateShort(r.issued_at)}</p></div>
          <span className="font-semibold tabular-nums">{usd2(r.total_cents)}</span>
          <button className="btn-ghost py-2" onClick={() => openFile(`/api/orders/${r.order_number}/invoice.pdf`, `${r.invoice_number}.pdf`)}>{t('View')}</button>
          <button className="btn-ghost py-2" onClick={() => openFile(`/api/orders/${r.order_number}/invoice.pdf?download=1`, `${r.invoice_number}.pdf`, true)}>{t('Download')}</button>
        </div>
      ))}
    </div>
  )
}
