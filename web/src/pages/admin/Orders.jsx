import { AlertTriangle, ChevronRight, FileText, ImageIcon, Lock, MessageCircle, Search, Send, Store, Unlock, User as UserIcon, X } from 'lucide-react'
import { fetchBlob, viewFile } from '../../components/FileViewer'
import { confirmDialog } from '../../components/Dialog'
import { useCallback, useEffect, useState } from 'react'
import { Link, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Badge, Empty, ErrorNote, Field, Loading, Modal, OrderBadge, Row } from '../../components/ui'
import { useApp } from '../../context/App'
import { api, openFile } from '../../lib/api'
import { cls, dateLong, dateTime, usd2 } from '../../lib/format'
import { H, Tabs } from './AdminApp'

const REASONS = { not_received: 'Ticket not received', invalid: "Ticket didn't work / entry refused", wrong: 'Wrong seat, category or quantity', other: 'Other problem' }

export default function Orders() {
  return <Routes><Route index element={<OrderList />} /><Route path=":id" element={<OrderDetail />} /></Routes>
}

function OrderList() {
  const [sp, setSp] = useSearchParams()
  const status = sp.get('status') ?? ''
  const issues = sp.get('issues') === '1'
  const scope = ['seller', 'buyer', 'listing'].find((k) => sp.get(k))
  const [q, setQ] = useState('')
  const [d, setD] = useState(null)
  useEffect(() => {
    setD(null)
    const extra = scope ? `&${scope}=${sp.get(scope)}` : ''
    api(`/api/admin/orders?status=${status}&q=${encodeURIComponent(q)}${issues ? '&issues=1' : ''}${extra}`).then(setD)
  }, [status, q, issues, scope, sp])
  const tab = issues ? 'issues' : status
  const setTab = (v) => setSp(v === 'issues' ? { issues: '1' } : v ? { status: v } : {})
  return (
    <div>
      <H title="Orders" />
      <Tabs value={tab} onChange={setTab} options={[['', 'All'], ['paid,preparing,awaiting_delivery', 'To deliver'], ['awaiting_payment', 'Awaiting payment'], ['delivered,completed', 'Delivered'], ['issues', 'Reports'], ['cancelled', 'Cancelled'], ['refunded', 'Refunded']]} />
      {scope && (
        <button onClick={() => setSp({})} className="chip mb-3 border-accent/40 bg-accent/10 text-accent">
          {scope === 'listing' ? `Listing #${sp.get(scope)}` : scope === 'seller' ? `Seller #${sp.get(scope)}` : `Buyer #${sp.get(scope)}`} — only these orders<X className="h-3.5 w-3.5" />
        </button>
      )}
      <div className="relative mb-4 max-w-lg">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input className="input h-11 pl-10" placeholder="Order, buyer, seller, concert or #listing" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {!d ? <Loading /> : !d.items.length ? <Empty title="No orders" /> : (
        <>
        <div className="space-y-2 md:hidden">
          {d.items.map((o) => (
            <Link key={o.id} to={`/admin/orders/${o.id}`} className="card card-hover block p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><p className="font-semibold">{o.order_number}</p><p className="truncate text-[13px] text-muted">{o.item.concert_title}</p></div>
                <OrderBadge status={o.status} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-raised p-2.5 text-[12px]">
                <div className="min-w-0"><p className="text-muted">Seller</p><p className="truncate font-semibold">{o.seller?.name || 'TicketNest stock'}</p></div>
                <div className="min-w-0"><p className="text-muted">Buyer</p><p className="truncate font-semibold">{o.contact.name}</p></div>
              </div>
              <div className="mt-2 flex items-center justify-between text-[13px]">
                <span className="text-muted">{o.item.category_name} × {o.item.quantity} · listing #{o.listing_id}{o.issue?.status === 'open' && <span className="ml-1.5 font-semibold text-warn">· reported</span>}</span>
                <b className="tabular-nums">{usd2(o.total_cents)}</b>
              </div>
              <p className="mt-1 text-[12px] text-muted">{dateTime(o.created_at)} · {o.channel}</p>
            </Link>
          ))}
        </div>
        <div className="card hidden overflow-x-auto md:block">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-[12px] text-muted"><tr><th className="px-4 py-3">Order</th><th>Concert</th><th>Seller</th><th>Buyer</th><th>Status</th><th className="px-4 text-right">Total</th></tr></thead>
            <tbody className="divide-y divide-line">
              {d.items.map((o) => (
                <tr key={o.id} className="transition hover:bg-raised">
                  <td className="px-4 py-3"><Link className="font-semibold hover:text-accent" to={`/admin/orders/${o.id}`}>{o.order_number}</Link><p className="text-[12px] text-muted">{dateTime(o.created_at)} · {o.channel}</p></td>
                  <td className="py-3">{o.item.concert_title}<p className="text-[12px] text-muted">{o.item.category_name} × {o.item.quantity}</p></td>
                  <td className="py-3">{o.seller?.name || 'TicketNest stock'}<p className="text-[12px] text-muted">{o.seller?.telegram ? `@${o.seller.telegram} · ` : ''}#{o.listing_id}</p></td>
                  <td className="py-3">{o.contact.name}<p className="text-[12px] text-muted">@{o.contact.telegram}{o.issue?.status === 'open' && <span className="ml-1 font-semibold text-warn">· reported</span>}</p></td>
                  <td className="py-3"><OrderBadge status={o.status} /></td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{usd2(o.total_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  )
}

function OrderDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const { user, toast } = useApp()
  const [o, setO] = useState(null)
  const [modal, setModal] = useState(null)
  const [error, setError] = useState(null)
  const load = useCallback(() => api(`/api/admin/orders/${id}`).then(setO), [id])
  useEffect(() => { load() }, [load])
  const post = async (path, body, form) => {
    setError(null)
    try { await api(`/api/admin/orders/${id}/${path}`, { method: 'POST', body, form }); toast('Saved'); setModal(null); load() } catch (e) { setError(e); toast(e.message, 'error') }
  }
  if (!o) return <Loading />
  const admin = user.role === 'admin'
  const paidLike = ['paid', 'preparing', 'awaiting_delivery'].includes(o.status)
  return (
    <div className="max-w-6xl">
      <button onClick={() => nav('/admin/orders')} className="text-sm text-muted hover:text-ink">← Orders</button>
      <H title={o.order_number} sub={`Placed ${dateTime(o.created_at)} via ${o.channel}`}><OrderBadge status={o.status} /></H>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          {paidLike && (
            <div className="card border-accent/30 p-5">
              <p className="font-semibold">Deliver the ticket</p>
              <ol className="mt-2 space-y-1 text-sm text-muted">
                <li>1. Message the buyer on Telegram: <a className="font-semibold text-accent" href={`https://t.me/${o.contact.telegram}`} target="_blank" rel="noreferrer">@{o.contact.telegram}</a></li>
                <li>2. Get the ticket from the seller (listing #{o.listing_id}) and send it to the buyer.</li>
                <li>3. Record the delivery here — this releases the seller's earnings.</li>
              </ol>
              <div className="mt-4 flex flex-wrap gap-2">
                <a className="btn-ghost" href={`https://t.me/${o.contact.telegram}`} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" />Message buyer</a>
                {o.status === 'paid' && <button className="btn-ghost" onClick={() => post('status', { status: 'preparing' })}>Mark preparing</button>}
                {o.status !== 'awaiting_delivery' && <button className="btn-ghost" onClick={() => post('status', { status: 'awaiting_delivery' })}>Mark awaiting delivery</button>}
                <button className="btn-accent" onClick={() => setModal('deliver')}><Send className="h-4 w-4" />Mark delivered</button>
              </div>
            </div>
          )}
          {o.issue?.status === 'open' && (
            <div className="card border-warn/50 bg-warn/5 p-5">
              <p className="flex items-center gap-2 font-semibold text-warn"><AlertTriangle className="h-5 w-5" />Buyer reported a problem</p>
              <p className="mt-2 text-sm"><b>{REASONS[o.issue.reason] || o.issue.reason}</b> · <span className="text-muted">{dateTime(o.issue.opened_at)}</span></p>
              <p className="mt-1 whitespace-pre-line text-sm">“{o.issue.details}”</p>
              <EvidenceGrid o={o} />
              <p className="mt-3 text-[13px] text-muted">The seller's payout is frozen. Check with the buyer and seller, then either dismiss the report (the seller is paid on schedule) or record a refund (the seller's earnings are taken back).</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="btn-primary" onClick={() => setModal('resolve')}>Dismiss report</button>
                {admin && <button className="btn-danger" onClick={() => setModal('refund')}>Record refund</button>}
              </div>
            </div>
          )}
          {o.issue?.status === 'resolved' && (
            <div className="card p-5 text-sm"><p className="font-semibold">Problem report resolved</p>
              <p className="mt-1 text-muted">{REASONS[o.issue.reason] || o.issue.reason} · “{o.issue.details}”</p>
              <p className="mt-1">{o.issue.resolution} <span className="text-muted">· {dateTime(o.issue.resolved_at)}</span></p></div>
          )}
          <div className="card p-5">
            <p className="mb-2 font-semibold">{o.item.concert_title}</p>
            <p className="mb-3 text-sm text-muted">{dateLong(o.item.concert_starts_at)} · {o.item.venue}</p>
            <Row k="Category" v={`${o.item.category_name} × ${o.item.quantity}`} /><Row k="Seat" v={o.item.seat_info || '—'} />
            <Row k="Seller price" v={`${usd2(o.item.unit_price_cents)} each`} /><Row k="Subtotal" v={usd2(o.subtotal_cents)} />
            <Row k="Buyer markup" v={usd2(o.markup_cents)} /><Row k="Seller commission" v={usd2(o.commission_cents)} />
            <Row k="Seller payout" v={usd2(o.seller_payout_cents)} /><Row k="Platform revenue" v={usd2(o.platform_revenue_cents)} />
            <Row k="Buyer paid" v={usd2(o.total_cents)} strong />
          </div>
          <div className="card p-5">
            <p className="mb-3 font-semibold">Payments</p>
            {o.payments.map((p) => (
              <div key={p.id} className="border-t border-line py-3 text-sm first:border-t-0 first:pt-0">
                <div className="flex flex-wrap items-center gap-2"><Badge tone={p.status === 'verified' ? 'good' : p.status === 'pending' ? 'warn' : 'muted'}>{p.status}</Badge>
                  <span className="font-semibold tabular-nums">{p.currency === 'USD' ? usd2(p.amount) : `${p.amount.toLocaleString()} KHR`}</span>
                  <span className="text-muted">KHQR · bill {p.bill_number}</span></div>
                <p className="mt-1 text-[12px] text-muted">Created {dateTime(p.created_at)}{p.expires_at && ` · expires ${dateTime(p.expires_at)}`}</p>
                {p.reference && <p className="mt-1 text-[12px]">Ref <b>{p.reference}</b> · verified {dateTime(p.verified_at)} by {p.verification_source}</p>}
                {p.note && <p className="mt-1 text-[12px] text-muted">{p.note}</p>}
              </div>
            ))}
            {admin && ['awaiting_payment', 'cancelled'].includes(o.status) && o.payments.some((p) => ['pending', 'expired'].includes(p.status)) && (
              <button className="btn-ghost mt-3" onClick={() => setModal('pay')}>Confirm payment manually (ABA Trx ID)</button>
            )}
          </div>
          <div className="card p-5">
            <p className="mb-3 font-semibold">History</p>
            {o.events.map((e, i) => <p key={i} className="border-t border-line py-2 text-sm first:border-t-0"><b>{e.status}</b> <span className="text-muted">· {dateTime(e.at)}</span>{e.note && <span className="block text-[12px] text-muted">{e.note}</span>}</p>)}
            {o.emails?.length > 0 && <><p className="mb-2 mt-5 font-semibold">Emails</p>{o.emails.map((e, i) => <p key={i} className="text-[13px] text-muted">{e.kind} → {e.to} · {e.status} · {dateTime(e.at)}</p>)}</>}
          </div>
        </div>
        <div className="space-y-4">
          <div className="card p-5 text-sm">
            <p className="mb-2 font-semibold">Buyer</p>
            <Row k="Name" v={o.contact.name} /><Row k="Telegram" v={`@${o.contact.telegram}`} />
            <Row k="Email" v={o.contact.email || '—'} /><Row k="Phone" v={o.contact.phone || '—'} />
            <Row k="Account" v={o.buyer.email || (o.buyer.telegram_username ? `@${o.buyer.telegram_username}` : `#${o.buyer.id}`)} />
            {o.buyer_history && (
              <p className={cls('mt-3 rounded-xl px-3 py-2 text-[12px]', o.buyer_history.reports || o.buyer_history.refunds ? 'bg-warn/10 text-warn' : 'bg-raised text-muted')}>
                History: {o.buyer_history.orders} other order(s) · {o.buyer_history.reports} earlier report(s) · {o.buyer_history.refunds} refund(s)
              </p>
            )}
            <Link to={`/admin/orders?buyer=${o.buyer.id}`} className="mt-3 flex items-center justify-between text-[13px] font-semibold text-accent">All orders by this buyer<ChevronRight className="h-4 w-4" /></Link>
          </div>
          <div className="card p-5 text-sm">
            <p className="mb-2 flex items-center gap-2 font-semibold"><Store className="h-4 w-4 text-accent" />Seller</p>
            {o.seller ? <>
              <Row k="Name" v={o.seller.name} />
              <Row k="Telegram" v={o.seller.telegram ? <a className="text-accent" href={`https://t.me/${o.seller.telegram}`} target="_blank" rel="noreferrer">@{o.seller.telegram}</a> : '—'} />
              <Row k="Email" v={o.seller.email || '—'} />
              <Row k="Listing" v={<Link className="text-accent" to={`/admin/listings/${o.seller.listing_id}`}>#{o.seller.listing_id}</Link>} />
              {o.seller.seat_info && <Row k="Seat" v={o.seller.seat_info} />}
              <Link to={`/admin/orders?seller=${o.seller.id}`} className="mt-3 flex items-center justify-between text-[13px] font-semibold text-accent">All sales by this seller<ChevronRight className="h-4 w-4" /></Link>
            </> : <p className="text-muted">TicketNest's own stock · <Link className="text-accent" to={`/admin/listings/${o.listing_id}`}>listing #{o.listing_id}</Link></p>}
          </div>
          {o.invoice_number && (
            <div className="card space-y-2 p-5">
              <p className="font-semibold">Invoice {o.invoice_number}</p>
              <button className="btn-ghost w-full" onClick={() => openFile(`/api/admin/orders/${o.id}/invoice.pdf`, `${o.invoice_number}.pdf`)}><FileText className="h-4 w-4" />View PDF</button>
              <button className="btn-ghost w-full" onClick={() => post('resend-invoice')}>Email invoice again</button>
            </div>
          )}
          {o.delivery && (
            <div className="card p-5 text-sm">
              <p className="mb-2 font-semibold">Delivery</p>
              <Row k="Method" v={o.delivery.method} /><Row k="When" v={dateTime(o.delivery.delivered_at)} /><Row k="By" v={o.delivery.admin || '—'} />
              {o.delivery.reference && <p className="mt-2 whitespace-pre-line text-muted">{o.delivery.reference}</p>}
              {o.delivery.has_file && <button className="btn-ghost mt-3 w-full" onClick={() => openFile(`/api/admin/orders/${o.id}/delivery-file`, 'delivery')}>Open attached file</button>}
            </div>
          )}
          {['delivered', 'completed'].includes(o.status) && o.seller_payout_cents > 0 && (
            <div className="card p-5 text-sm">
              <p className="mb-2 flex items-center gap-2 font-semibold">{o.payout_released_at ? <Unlock className="h-4 w-4 text-good" /> : <Lock className="h-4 w-4 text-warn" />}Seller payout</p>
              {o.payout_released_at
                ? <p className="text-good">Released {dateTime(o.payout_released_at)}</p>
                : o.payout_release_at
                  ? <p className="text-muted">Held until {dateTime(o.payout_release_at)} (after the concert){o.issue?.status === 'open' && ', frozen by the buyer\'s report'}</p>
                  : <p className="text-muted">Released at delivery (before buyer protection)</p>}
              {o.buyer_confirmed_at && <p className="mt-1 text-good">Buyer confirmed receipt {dateTime(o.buyer_confirmed_at)}</p>}
              {admin && !o.payout_released_at && o.payout_release_at && o.issue?.status !== 'open' && (
                <button className="btn-ghost mt-3 w-full" onClick={async () => { if (await confirmDialog({ title: 'Pay the seller now?', message: 'This releases the earnings before the usual hold ends. Only do this if you are sure the ticket is genuine.', confirmText: 'Release payout' })) post('release-payout') }}>Release payout now</button>
              )}
            </div>
          )}
          <div className="card space-y-2 p-5">
            {o.status === 'delivered' && <button className="btn-ghost w-full" onClick={() => post('status', { status: 'completed' })}>Mark completed</button>}
            {o.status === 'awaiting_payment' && <button className="btn-danger w-full" onClick={() => setModal('cancel')}>Cancel order</button>}
            {admin && ['paid', 'preparing', 'awaiting_delivery', 'delivered', 'completed'].includes(o.status) && <button className="btn-danger w-full" onClick={() => setModal('refund')}>Record refund</button>}
            <NoteBox o={o} onSave={(t) => post('note', { reason: t })} />
          </div>
        </div>
      </div>
      <ErrorNote error={error} />
      <DeliverModal open={modal === 'deliver'} onClose={() => setModal(null)} onSubmit={(fd) => post('deliver', undefined, fd)} />
      <ReasonModal open={modal === 'cancel'} title="Cancel order" label="Reason" onClose={() => setModal(null)} onSubmit={(r) => post('cancel', { reason: r })} />
      <RefundModal open={modal === 'refund'} onClose={() => setModal(null)} onSubmit={(b) => post('refund', b)} />
      <ReasonModal open={modal === 'resolve'} title="Dismiss the buyer's report" label="What you found (shown to the buyer)"
        hint="The seller will be paid on schedule. To give the buyer their money back instead, use Record refund." onClose={() => setModal(null)} onSubmit={(n) => post('issue/resolve', { note: n })} />
      <ReasonModal open={modal === 'pay'} title="Confirm payment manually" label="ABA transaction ID (from the PayWay message or bank app)"
        hint="Only use this after you have checked the money arrived. Each transaction ID can be used once." onClose={() => setModal(null)} onSubmit={(t) => post('confirm-payment', { trx_id: t })} />
    </div>
  )
}

function NoteBox({ o, onSave }) {
  const [t, setT] = useState(o.admin_note || '')
  return <div><Field label="Internal note"><textarea className="input min-h-[70px]" value={t} onChange={(e) => setT(e.target.value)} /></Field><button className="btn-ghost mt-2 w-full py-2" onClick={() => onSave(t)}>Save note</button></div>
}

function DeliverModal({ open, onClose, onSubmit }) {
  const [method, setMethod] = useState('telegram')
  const [ref, setRef] = useState('')
  const [file, setFile] = useState(null)
  return (
    <Modal open={open} onClose={onClose} title="Record delivery">
      <div className="space-y-3">
        <Field label="Delivery method"><select className="input" value={method} onChange={(e) => setMethod(e.target.value)}><option value="telegram">Telegram</option><option value="app_transfer">Ticketing app transfer</option><option value="email">Email</option><option value="in_person">In person</option></select></Field>
        <Field label="Reference / notes"><textarea className="input min-h-[80px]" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. Sent PDF e-ticket to @buyer at 14:20" /></Field>
        <p className="rounded-xl bg-accent/5 p-3 text-[12px] leading-relaxed text-muted"><b className="text-ink">Protect yourself and the seller:</b> attach a screenshot of the transfer (it shows the buyer's account and the time) or the ticket file. If the buyer later claims they never got it, this is your proof.</p>
        <Field label="Attach transfer screenshot or ticket file" hint="Strongly recommended. The buyer can download it from their order"><input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files[0])} className="text-sm" /></Field>
        <button className="btn-accent w-full" onClick={() => { const fd = new FormData(); fd.append('method', method); fd.append('reference', ref); if (file) fd.append('file', file); onSubmit(fd) }}>Mark delivered</button>
      </div>
    </Modal>
  )
}

function ReasonModal({ open, title, label, hint, onClose, onSubmit }) {
  const [t, setT] = useState('')
  return <Modal open={open} onClose={onClose} title={title}><Field label={label} hint={hint}><input className="input" value={t} onChange={(e) => setT(e.target.value)} /></Field><button className="btn-primary mt-4 w-full" disabled={!t.trim()} onClick={() => onSubmit(t.trim())}>Confirm</button></Modal>
}

function RefundModal({ open, onClose, onSubmit }) {
  const [reason, setReason] = useState('')
  const [restock, setRestock] = useState(false)
  return (
    <Modal open={open} onClose={onClose} title="Record a refund">
      <p className="mb-3 text-sm text-muted">Send the money back from your bank app first. This records the refund, reverses the seller's earnings and emails the buyer.</p>
      <Field label="Reason (shown to the buyer)"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} />Put the tickets back on sale</label>
      <button className="btn-danger mt-4 w-full" disabled={reason.trim().length < 3} onClick={() => onSubmit({ reason, restock })}>Record refund</button>
    </Modal>
  )
}

function EvidenceGrid({ o }) {
  const n = o.issue_evidence_count || 0
  const [urls, setUrls] = useState([])
  useEffect(() => {
    let made = []
    Promise.all(Array.from({ length: n }, (_, i) => fetchBlob(`/api/admin/orders/${o.id}/evidence/${i}`).then((b) => URL.createObjectURL(b)).catch(() => null)))
      .then((u) => { made = u; setUrls(u) })
    return () => made.forEach((u) => u && URL.revokeObjectURL(u))
  }, [o.id, n])
  if (!n) return <p className="mt-2 flex items-center gap-1.5 text-[12px] text-muted"><ImageIcon className="h-3.5 w-3.5" />No photos attached</p>
  return (
    <div className="mt-3 grid grid-cols-3 gap-2">
      {Array.from({ length: n }, (_, i) => (
        <button key={i} onClick={() => viewFile({ path: `/api/admin/orders/${o.id}/evidence/${i}`, name: `${o.order_number}-report-${i + 1}.jpg` })}
          className="aspect-square overflow-hidden rounded-xl border border-line bg-raised">
          {urls[i] ? <img src={urls[i]} alt={`Report photo ${i + 1}`} className="h-full w-full object-cover" /> : <span className="skeleton block h-full w-full" />}
        </button>
      ))}
    </div>
  )
}
