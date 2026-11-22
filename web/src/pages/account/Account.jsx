import { FileText, LogOut, Pencil, Receipt, Shield, Ticket, Wallet, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { GoogleButton, TelegramButton } from '../../components/SocialSignIn'
import { Empty, ErrorNote, Field, ListingBadge, Loading, Modal, OrderBadge, PasswordInput, Spinner, Stat } from '../../components/ui'
import { useApp, useLink } from '../../context/App'
import { api, openFile } from '../../lib/api'
import { cls, dateLong, dateShort, dateTime, usd2 } from '../../lib/format'
import { inTelegram } from '../../lib/telegram'

const TABS = [['', 'Profile'], ['/orders', 'My orders'], ['/listings', 'My listings'], ['/wallet', 'Wallet'], ['/invoices', 'Invoices']]

export default function Account() {
  const { user, logout } = useApp()
  const link = useLink()
  const nav = useNavigate()
  return (
    <div className="page pt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="eyebrow">My account</p><h1 className="mt-1 text-3xl font-bold">Hi, {user.full_name.split(' ')[0]}</h1></div>
        <div className="flex gap-2">
          {user.role !== 'customer' && !inTelegram() && <Link to="/admin" className="btn-ghost"><Shield className="h-4 w-4" />Admin</Link>}
          {!inTelegram() && <button className="btn-ghost" onClick={() => { logout(); nav('/') }}><LogOut className="h-4 w-4" />Sign out</button>}
        </div>
      </div>
      <nav className="no-scrollbar -mx-4 mt-6 flex gap-1 overflow-x-auto border-b border-line px-4">
        {TABS.map(([p, l]) => (
          <NavLink key={p} end={p === ''} to={link(`/account${p}`)}
            className={({ isActive }) => cls('whitespace-nowrap border-b-2 px-3 pb-3 pt-1 text-sm font-semibold transition', isActive ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink')}>{l}</NavLink>
        ))}
      </nav>
      <div className="mt-6"><Outlet /></div>
    </div>
  )
}

export function Profile() {
  const { user, setUser, toast } = useApp()
  const [f, setF] = useState({ full_name: user.full_name, email: user.email || '', phone: user.phone || '', telegram_username: user.telegram_username || '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [pwOpen, setPwOpen] = useState(false)
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setError(null)
    try { setUser(await api('/api/account/me', { method: 'PATCH', body: { ...f, email: f.email || null } })); toast('Profile saved') } catch (err) { setError(err) } finally { setBusy(false) }
  }
  const linked = (u) => { setUser(u.user || u); toast('Account linked') }
  const unlink = async (p) => { try { setUser(await api(`/api/account/link/${p}`, { method: 'DELETE' })); toast('Disconnected') } catch (e) { toast(e.message, 'error') } }
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <form onSubmit={save} className="card space-y-4 p-5 sm:p-6">
        <p className="font-semibold">Profile</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name"><input className="input" value={f.full_name} onChange={set('full_name')} /></Field>
          <Field label="Email" hint={user.email && !user.email_verified ? 'Not verified yet' : ''}><input className="input" type="email" value={f.email} onChange={set('email')} /></Field>
          <Field label="Phone"><input className="input" value={f.phone} onChange={set('phone')} /></Field>
          <Field label="Telegram username" hint="Used to deliver your tickets"><input className="input" value={f.telegram_username} onChange={set('telegram_username')} placeholder="@username" /></Field>
        </div>
        <ErrorNote error={error} />
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" disabled={busy}>{busy && <Spinner className="h-4 w-4" />}Save changes</button>
          <button type="button" className="btn-ghost" onClick={() => setPwOpen(true)}>{user.has_password ? 'Change password' : 'Set a password'}</button>
        </div>
      </form>
      <div className="card space-y-4 p-5 sm:p-6">
        <p className="font-semibold">Sign-in methods</p>
        <Conn name="Email & password" on={user.has_password} detail={user.email} />
        <Conn name="Google" on={user.providers.includes('google')} onOff={() => unlink('google')}>
          {!user.providers.includes('google') && <GoogleButton mode="link" label="Connect Google" onDone={linked} />}
        </Conn>
        <Conn name="Telegram" on={!!user.telegram_id} detail={user.telegram_username && `@${user.telegram_username}`} onOff={() => unlink('telegram')}>
          {!user.telegram_id && <TelegramButton mode="link" onDone={linked} />}
        </Conn>
      </div>
      <PasswordModal open={pwOpen} onClose={() => setPwOpen(false)} hasPassword={user.has_password} onDone={() => { setUser({ ...user, has_password: true }); toast('Password saved') }} />
    </div>
  )
}

function Conn({ name, on, detail, onOff, children }) {
  return (
    <div className="rounded-xl border border-line p-3.5">
      <div className="flex items-center justify-between gap-3">
        <div><p className="text-sm font-semibold">{name}</p><p className="text-[12px] text-muted">{on ? detail || 'Connected' : 'Not connected'}</p></div>
        {on && onOff && <button onClick={onOff} className="text-[12px] font-medium text-muted hover:text-bad">Disconnect</button>}
      </div>
      {children && <div className="mt-3">{children}</div>}
    </div>
  )
}

function PasswordModal({ open, onClose, hasPassword, onDone }) {
  const [cur, setCur] = useState('')
  const [pw, setPw] = useState('')
  const [error, setError] = useState(null)
  const submit = async (e) => {
    e.preventDefault(); setError(null)
    try { await api('/api/account/password', { method: 'POST', body: { current_password: cur, new_password: pw } }); onDone(); onClose() } catch (err) { setError(err) }
  }
  return (
    <Modal open={open} onClose={onClose} title={hasPassword ? 'Change password' : 'Set a password'}>
      <form onSubmit={submit} className="space-y-4">
        {hasPassword && <Field label="Current password"><PasswordInput value={cur} onChange={(e) => setCur(e.target.value)} /></Field>}
        <Field label="New password" hint="At least 8 characters, with letters and numbers"><PasswordInput autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
        <ErrorNote error={error} />
        <button className="btn-primary w-full">Save password</button>
      </form>
    </Modal>
  )
}

export function MyOrders() {
  const link = useLink()
  const [rows, setRows] = useState(null)
  useEffect(() => { api('/api/orders').then(setRows).catch(() => setRows([])) }, [])
  if (!rows) return <Loading />
  if (!rows.length) return <Empty icon={Ticket} title="No orders yet" action={<Link to={link('/concerts')} className="btn-primary">Find tickets</Link>}>Tickets you buy will show up here with their delivery status.</Empty>
  return (
    <div className="card divide-y divide-line">
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
    if (!confirm('Cancel this listing? It will be removed from sale.')) return
    try { await api(`/api/sell/listings/${l.id}/cancel`, { method: 'POST' }); toast('Listing cancelled'); load() } catch (e) { toast(e.message, 'error') }
  }
  if (!rows) return <Loading />
  return (
    <div className="space-y-6">
      {dash && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Total listings" value={dash.total_listings} hint={`${dash.pending_listings} pending`} />
          <Stat label="Tickets on sale" value={dash.available_tickets} hint={`${dash.sold_tickets} sold`} />
          <Stat label="Gross sales" value={usd2(dash.gross_sales_cents)} hint={`Commission ${usd2(dash.commission_cents)}`} />
          <Stat label="Net earnings" value={usd2(dash.net_earnings_cents)} hint={`${dash.pending_withdrawals} withdrawal(s) pending · ${dash.completed_withdrawals} paid`} />
        </div>
      )}
      <div className="flex justify-end"><Link to={link('/sell')} className="btn-accent">List tickets</Link></div>
      {!rows.length ? <Empty icon={Ticket} title="No listings yet">Can't make a show? List your tickets and we'll handle the sale.</Empty> : (
        <div className="space-y-3">
          {rows.map((l) => (
            <div key={l.id} className="card p-4">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{l.concert.title}</p>
                  <p className="text-[13px] text-muted">#{l.id} · {l.category}{l.seat_info && ` · ${l.seat_info}`} · {dateLong(l.concert.starts_at)}</p>
                </div>
                <ListingBadge status={l.status} />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
                <span><span className="text-muted">Price</span> <b>{usd2(l.price_cents)}</b></span>
                <span><span className="text-muted">You get</span> <b>{usd2(l.net_per_ticket_cents)}</b>/ticket</span>
                <span><span className="text-muted">Sold</span> <b>{l.quantity_sold}/{l.quantity}</b></span>
                {l.quantity_reserved > 0 && <span className="text-accent">{l.quantity_reserved} on hold</span>}
              </div>
              {l.status === 'rejected' && l.rejection_reason && <p className="mt-3 rounded-xl bg-bad/5 p-3 text-[13px] text-bad">Reason: {l.rejection_reason}</p>}
              {(l.can_edit || l.can_cancel) && (
                <div className="mt-3 flex gap-2">
                  {l.can_edit && <button className="btn-ghost py-2" onClick={() => setEdit(l)}><Pencil className="h-4 w-4" />Edit</button>}
                  {l.can_cancel && <button className="btn-ghost py-2" onClick={() => cancel(l)}><X className="h-4 w-4" />Cancel</button>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <EditListing l={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); toast('Saved — your listing is back in review') }} />
    </div>
  )
}

function EditListing({ l, onClose, onSaved }) {
  const [f, setF] = useState({})
  const [error, setError] = useState(null)
  useEffect(() => { if (l) setF({ price: (l.price_cents / 100).toString(), quantity: l.quantity, seat_info: l.seat_info, notes: l.notes }) }, [l])
  if (!l) return null
  const save = async (e) => {
    e.preventDefault(); setError(null)
    try { await api(`/api/sell/listings/${l.id}`, { method: 'PATCH', body: f }); onSaved() } catch (err) { setError(err) }
  }
  return (
    <Modal open onClose={onClose} title={`Edit listing #${l.id}`}>
      <form onSubmit={save} className="space-y-4">
        <p className="text-sm text-muted">Changes are reviewed again before the listing goes back on sale.</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Price (USD)"><input className="input" inputMode="decimal" value={f.price || ''} onChange={(e) => setF({ ...f, price: e.target.value })} /></Field>
          <Field label="Quantity"><input className="input" type="number" min={Math.max(1, l.quantity_sold)} value={f.quantity || 1} onChange={(e) => setF({ ...f, quantity: Number(e.target.value) })} /></Field>
        </div>
        <Field label="Seat"><input className="input" value={f.seat_info || ''} onChange={(e) => setF({ ...f, seat_info: e.target.value })} /></Field>
        <Field label="Notes"><textarea className="input" value={f.notes || ''} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        <ErrorNote error={error} />
        <button className="btn-primary w-full">Save</button>
      </form>
    </Modal>
  )
}

const TX = { sale_pending: 'Sale (pending delivery)', sale_released: 'Earnings released', sale_reversed: 'Refund reversal',
  withdrawal_hold: 'Withdrawal requested', withdrawal_paid: 'Withdrawal paid', withdrawal_returned: 'Withdrawal returned', adjustment: 'Adjustment' }

export function MyWallet() {
  const { toast } = useApp()
  const [w, setW] = useState(null)
  const [wds, setWds] = useState([])
  const [open, setOpen] = useState(false)
  const load = useCallback(() => { api('/api/account/wallet').then(setW); api('/api/account/withdrawals').then(setWds) }, [])
  useEffect(() => { load() }, [load])
  if (!w) return <Loading />
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Available to withdraw" value={usd2(w.available_cents)} />
        <Stat label="Pending delivery" value={usd2(w.pending_cents)} hint="Released when the buyer gets the ticket" />
        <Stat label="In withdrawal" value={usd2(w.held_cents)} />
        <Stat label="Paid out" value={usd2(w.withdrawn_cents)} />
      </div>
      <button className="btn-accent" disabled={w.available_cents < w.min_withdrawal_cents} onClick={() => setOpen(true)}><Wallet className="h-4 w-4" />Request withdrawal</button>
      {w.available_cents < w.min_withdrawal_cents && <p className="text-[13px] text-muted">Minimum withdrawal is {usd2(w.min_withdrawal_cents)}.</p>}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <p className="font-semibold">Withdrawals</p>
          {!wds.length ? <p className="mt-3 text-sm text-muted">No withdrawals yet.</p> : wds.map((x) => (
            <div key={x.id} className="flex items-center justify-between gap-3 border-t border-line py-3 text-sm first:mt-3">
              <div><p className="font-medium">#{x.id} · {x.method} {x.account_number}</p><p className="text-[12px] text-muted">{dateTime(x.created_at)}{x.admin_note && ` · ${x.admin_note}`}</p></div>
              <div className="text-right"><p className="font-semibold">{usd2(x.amount_cents)}</p><p className={cls('text-[12px] font-semibold', x.status === 'paid' ? 'text-good' : x.status === 'pending' ? 'text-warn' : 'text-muted')}>{x.status}</p></div>
            </div>
          ))}
        </div>
        <div className="card p-5">
          <p className="font-semibold">Wallet activity</p>
          {!w.transactions.length ? <p className="mt-3 text-sm text-muted">Sales and payouts will appear here.</p> : w.transactions.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3 border-t border-line py-3 text-sm first:mt-3">
              <div><p className="font-medium">{TX[t.type] || t.type}</p><p className="text-[12px] text-muted">{t.note} · {dateTime(t.created_at)}</p></div>
              <span className="font-semibold tabular-nums">{usd2(t.amount_cents)}</span>
            </div>
          ))}
        </div>
      </div>
      <WithdrawModal open={open} onClose={() => setOpen(false)} max={w.available_cents} onDone={() => { setOpen(false); toast('Withdrawal requested. We will pay it to your account after review.'); load() }} />
    </div>
  )
}

function WithdrawModal({ open, onClose, max, onDone }) {
  const [f, setF] = useState({ amount: '', method: 'ABA', account_name: '', account_number: '' })
  const [error, setError] = useState(null)
  const submit = async (e) => {
    e.preventDefault(); setError(null)
    try { await api('/api/account/withdrawals', { method: 'POST', body: f }); onDone() } catch (err) { setError(err) }
  }
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  return (
    <Modal open={open} onClose={onClose} title="Request a withdrawal">
      <form onSubmit={submit} className="space-y-4">
        <Field label={`Amount (max ${usd2(max)})`}><input className="input" inputMode="decimal" value={f.amount} onChange={set('amount')} placeholder={(max / 100).toFixed(2)} /></Field>
        <Field label="Bank / wallet"><select className="input" value={f.method} onChange={set('method')}>{['ABA', 'ACLEDA', 'Wing', 'Bakong', 'Other bank'].map((m) => <option key={m}>{m}</option>)}</select></Field>
        <Field label="Account name"><input className="input" value={f.account_name} onChange={set('account_name')} /></Field>
        <Field label="Account number"><input className="input" inputMode="numeric" value={f.account_number} onChange={set('account_number')} /></Field>
        <p className="text-[12px] text-muted">Withdrawals are reviewed and paid manually by TicketNest, usually within 1–2 business days.</p>
        <ErrorNote error={error} />
        <button className="btn-primary w-full">Request withdrawal</button>
      </form>
    </Modal>
  )
}

export function MyInvoices() {
  const [rows, setRows] = useState(null)
  useEffect(() => { api('/api/account/invoices').then(setRows).catch(() => setRows([])) }, [])
  if (!rows) return <Loading />
  if (!rows.length) return <Empty icon={Receipt} title="No invoices yet">An invoice is issued for every order once its payment is verified.</Empty>
  return (
    <div className="card divide-y divide-line">
      {rows.map((r) => (
        <div key={r.invoice_number} className="flex flex-wrap items-center gap-3 p-4">
          <FileText className="h-5 w-5 text-muted" />
          <div className="min-w-0 flex-1"><p className="font-semibold">{r.invoice_number}</p><p className="truncate text-[13px] text-muted">{r.order_number} · {r.concert_title} · {dateShort(r.issued_at)}</p></div>
          <span className="font-semibold tabular-nums">{usd2(r.total_cents)}</span>
          <button className="btn-ghost py-2" onClick={() => openFile(`/api/orders/${r.order_number}/invoice.pdf`, `${r.invoice_number}.pdf`)}>View</button>
          <button className="btn-ghost py-2" onClick={() => openFile(`/api/orders/${r.order_number}/invoice.pdf?download=1`, `${r.invoice_number}.pdf`, true)}>Download</button>
        </div>
      ))}
    </div>
  )
}
