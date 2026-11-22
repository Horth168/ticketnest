import { FileText, MessageCircle, Send } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Badge, Empty, ErrorNote, Field, Loading, Modal, OrderBadge, Row } from '../../components/ui'
import { useApp } from '../../context/App'
import { api, openFile } from '../../lib/api'
import { dateLong, dateTime, usd2 } from '../../lib/format'
import { H, Tabs } from './AdminApp'

export default function Orders() {
  return <Routes><Route index element={<OrderList />} /><Route path=":id" element={<OrderDetail />} /></Routes>
}

function OrderList() {
  const [sp, setSp] = useSearchParams()
  const status = sp.get('status') ?? ''
  const [q, setQ] = useState('')
  const [d, setD] = useState(null)
  useEffect(() => { setD(null); api(`/api/admin/orders?status=${status}&q=${encodeURIComponent(q)}`).then(setD) }, [status, q])
  return (
    <div>
      <H title="Orders" />
      <Tabs value={status} onChange={(v) => setSp(v ? { status: v } : {})} options={[['', 'All'], ['paid,preparing,awaiting_delivery', 'To deliver'], ['awaiting_payment', 'Awaiting payment'], ['delivered,completed', 'Delivered'], ['cancelled', 'Cancelled'], ['refunded', 'Refunded']]} />
      <input className="input mb-4 max-w-sm" placeholder="Order number, name, Telegram, email" value={q} onChange={(e) => setQ(e.target.value)} />
      {!d ? <Loading /> : !d.items.length ? <Empty title="No orders" /> : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-[12px] text-muted"><tr><th className="px-4 py-3">Order</th><th>Concert</th><th>Buyer</th><th>Status</th><th className="px-4 text-right">Total</th></tr></thead>
            <tbody className="divide-y divide-line">
              {d.items.map((o) => (
                <tr key={o.id} className="hover:bg-raised">
                  <td className="px-4 py-3"><Link className="font-semibold hover:text-accent" to={`/admin/orders/${o.id}`}>{o.order_number}</Link><p className="text-[12px] text-muted">{dateTime(o.created_at)} · {o.channel}</p></td>
                  <td className="py-3">{o.item.concert_title}<p className="text-[12px] text-muted">{o.item.category_name} × {o.item.quantity}</p></td>
                  <td className="py-3">{o.contact.name}<p className="text-[12px] text-muted">@{o.contact.telegram}</p></td>
                  <td className="py-3"><OrderBadge status={o.status} /></td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{usd2(o.total_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
        <Field label="Attach confirmation or ticket file (optional)" hint="The buyer can download it from their order"><input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files[0])} className="text-sm" /></Field>
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
