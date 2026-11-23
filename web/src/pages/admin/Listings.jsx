import { Check, ChevronRight, ExternalLink, Maximize2, Plus, Search, Ticket, User as UserIcon, X } from 'lucide-react'
import { viewFile } from '../../components/FileViewer'
import { promptDialog } from '../../components/Dialog'
import { useCallback, useEffect, useState } from 'react'
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { Empty, ErrorNote, Field, ListingBadge, Loading, Modal, OrderBadge, Row } from '../../components/ui'
import { useApp } from '../../context/App'
import { api, openFile } from '../../lib/api'
import { dateLong, dateTime, TICKET_TYPES, usd2 } from '../../lib/format'
import { H, Tabs } from './AdminApp'

export default function Listings() {
  return <Routes><Route index element={<ListingList />} /><Route path=":id" element={<ListingDetail />} /></Routes>
}

function ListingList() {
  const [status, setStatus] = useState('pending')
  const [q, setQ] = useState('')
  const [rows, setRows] = useState(null)
  const [adding, setAdding] = useState(false)
  const load = useCallback(() => { setRows(null); api(`/api/admin/listings?status=${status}&q=${encodeURIComponent(q)}`).then(setRows) }, [status, q])
  useEffect(() => { load() }, [load])
  return (
    <div>
      <H title="Listings" sub="Approve seller tickets before they go public, or add TicketNest's own tickets.">
        <button className="btn-primary" onClick={() => setAdding(true)}><Plus className="h-4 w-4" />Add tickets manually</button>
      </H>
      <Tabs value={status} onChange={setStatus} options={[['pending', 'Pending approval'], ['available', 'Available'], ['reserved', 'Reserved'], ['sold', 'Sold'], ['rejected', 'Rejected'], ['disabled', 'Disabled'], ['cancelled', 'Cancelled'], ['', 'All']]} />
      <div className="relative mb-4 max-w-md">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input className="input h-11 pl-10" placeholder="Filter by concert" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {!rows ? <Loading /> : !rows.length ? <Empty title="Nothing here">No listings with this status.</Empty> : (
        <div className="grid gap-3 lg:grid-cols-2">
          {rows.map((l) => (
            <Link key={l.id} to={`/admin/listings/${l.id}`} className="card card-hover flex flex-col gap-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold text-muted">Listing #{l.id}</p>
                  <p className="mt-0.5 line-clamp-2 font-semibold leading-snug">{l.concert.title}</p>
                </div>
                <ListingBadge status={l.status} />
              </div>
              <div className="flex flex-wrap gap-1.5 text-[12px]">
                <span className="rounded-full bg-raised px-2.5 py-1 font-semibold">{l.category}</span>
                <span className="rounded-full bg-raised px-2.5 py-1">{l.quantity} ticket{l.quantity === 1 ? '' : 's'}</span>
                {l.seat_info && <span className="max-w-full truncate rounded-full bg-raised px-2.5 py-1">{l.seat_info}</span>}
              </div>
              <div className="flex items-end justify-between gap-3 border-t border-line pt-3">
                <div className="min-w-0 text-[12px] text-muted">
                  <p className="flex items-center gap-1.5 truncate"><UserIcon className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{l.seller?.name || 'TicketNest stock'}</span></p>
                  <p className="mt-0.5">{dateTime(l.listed_at)}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-display text-[17px] font-bold tabular-nums">{usd2(l.price_cents)}</p>
                  <p className="text-[11.5px] text-muted">buyer pays {usd2(l.buyer_price_cents)}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
      <ManualListing open={adding} onClose={() => setAdding(false)} onDone={() => { setAdding(false); setStatus('available'); load() }} />
    </div>
  )
}

function ProofImage({ listingId, f }) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    if (!f.type.startsWith('image/')) return
    let u
    api(`/api/admin/listings/${listingId}/files/${f.id}`, { raw: true }).then((r) => r.blob()).then((b) => { u = URL.createObjectURL(b); setUrl(u) })
    return () => u && URL.revokeObjectURL(u)
  }, [listingId, f])
  return (
    <button onClick={() => viewFile({ path: `/api/admin/listings/${listingId}/files/${f.id}`, name: f.name })} className="group relative block w-full min-w-0 overflow-hidden rounded-xl border border-line bg-raised text-left">
      <span className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/55 text-white"><Maximize2 className="h-4 w-4" /></span>
      {url ? <img src={url} alt={f.name} className="h-44 w-full object-contain" /> : <div className="grid h-44 place-items-center text-sm text-muted">PDF · open</div>}
      <p className="flex items-center gap-1.5 border-t border-line px-3 py-2 text-[12px] text-muted"><span className="min-w-0 truncate">{f.name}</span><ExternalLink className="h-3 w-3 shrink-0" /></p>
    </button>
  )
}

function ListingDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const { toast } = useApp()
  const [l, setL] = useState(null)
  const [reason, setReason] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const [edit, setEdit] = useState(null)
  const load = useCallback(() => api(`/api/admin/listings/${id}`).then(setL), [id])
  useEffect(() => { load() }, [load])
  const act = async (path, body) => {
    try { setL({ ...(await api(`/api/admin/listings/${id}/${path}`, { method: 'POST', body })), orders: l.orders }); toast('Saved') } catch (e) { toast(e.message, 'error') }
  }
  if (!l) return <Loading />
  return (
    <div className="max-w-5xl">
      <button onClick={() => nav('/admin/listings')} className="text-sm text-muted hover:text-ink">← Listings</button>
      <H title={`Listing #${l.id}`} sub={`${l.concert.title} · ${dateLong(l.concert.starts_at)}`}><ListingBadge status={l.status} /></H>
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <div className="card p-5">
            <p className="text-[12px] text-muted">Private — only admins and the seller can open these. Compare the receipt's price with the original price below.</p>
            {[['proof', 'Ticket proof'], ['receipt', 'Purchase receipt']].map(([kind, title]) => {
              const files = l.files.filter((f) => (f.kind || 'proof') === kind)
              return (
                <div key={kind} className="mt-4">
                  <p className="font-semibold">{title} ({files.length})</p>
                  {files.length ? <div className="mt-2 grid gap-3 sm:grid-cols-2">{files.map((f) => <ProofImage key={f.id} listingId={l.id} f={f} />)}</div>
                    : <p className="mt-1 rounded-xl bg-warn/10 p-3 text-[13px] text-warn">Not provided{kind === 'receipt' ? ' (listing created before receipts were required)' : ''}.</p>}
                </div>
              )
            })}
          </div>
          <div className="card p-5">
            <p className="mb-2 font-semibold">Details</p>
            <Row k="Category" v={l.category} /><Row k="Seat" v={l.seat_info || '—'} /><Row k="Type" v={TICKET_TYPES[l.ticket_type]} />
            <Row k="Quantity" v={`${l.quantity} (sold ${l.quantity_sold}, held ${l.quantity_reserved}, available ${l.available})`} />
            <Row k="Original (face) price" v={usd2(l.original_price_cents)} /><Row k="Seller listing price" v={usd2(l.price_cents)} />
            <Row k="Buyer pays" v={usd2(l.buyer_price_cents)} /><Row k="Seller receives" v={usd2(l.net_per_ticket_cents)} />
            {l.notes && <p className="mt-3 whitespace-pre-line rounded-xl bg-raised p-3 text-sm">{l.notes}</p>}
            {l.rejection_reason && <p className="mt-3 rounded-xl bg-bad/5 p-3 text-sm text-bad">Rejected: {l.rejection_reason}</p>}
          </div>
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3.5">
              <p className="flex items-center gap-2 font-semibold"><Ticket className="h-4 w-4 text-accent" />Sold to {l.orders?.length ? <span className="text-muted">· {l.orders.length}</span> : null}</p>
              {l.orders?.length > 0 && <Link to={`/admin/orders?listing=${l.id}`} className="text-[13px] font-semibold text-accent">All orders</Link>}
            </div>
            {!l.orders?.length ? <p className="p-4 text-sm text-muted">Nobody has bought from this listing yet.</p> : l.orders.map((o) => (
              <Link key={o.id} to={`/admin/orders/${o.id}`} className="flex items-center gap-3 border-b border-line px-4 py-3 text-sm last:border-b-0 hover:bg-raised">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{o.contact.name} <span className="font-normal text-muted">@{o.contact.telegram}</span></p>
                  <p className="text-[12px] text-muted">{o.order_number} · {o.item.quantity} ticket{o.item.quantity === 1 ? '' : 's'} · {dateTime(o.created_at)}</p>
                </div>
                <OrderBadge status={o.status} />
                <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
              </Link>
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <div className="card space-y-2 p-5">
            {['pending', 'rejected', 'disabled'].includes(l.status) && <button className="btn-accent w-full" onClick={() => act('approve')}><Check className="h-4 w-4" />Approve & publish</button>}
            {['pending', 'available', 'approved', 'disabled'].includes(l.status) && <button className="btn-danger w-full" onClick={() => setRejecting(true)}><X className="h-4 w-4" />Reject</button>}
            {['available', 'reserved'].includes(l.status) && <button className="btn-ghost w-full" onClick={() => act('disable')}>Disable (hide)</button>}
            {l.status === 'disabled' && <button className="btn-ghost w-full" onClick={() => act('enable')}>Re-enable</button>}
            <button className="btn-ghost w-full" onClick={() => setEdit({ price: l.price_cents / 100, original_price: l.original_price_cents / 100, quantity: l.quantity })}>Edit price / quantity</button>
            {l.available > 0 && <button className="btn-ghost w-full" onClick={async () => {
              const n = await promptDialog({ title: 'Mark tickets sold outside TicketNest', message: 'Use this when tickets from this listing were sold elsewhere, so they are no longer offered here.', label: `How many tickets? (1–${l.available})`, type: 'number', min: 1, max: l.available, defaultValue: 1, confirmText: 'Mark sold' })
              if (n) act('mark-sold', { quantity: n })
            }}>Mark tickets sold (offline)</button>}
          </div>
          {l.seller ? (
            <div className="card p-5 text-sm">
              <p className="mb-2 font-semibold">Seller</p>
              <Row k="Name" v={l.seller.name} /><Row k="Email" v={l.seller.email || '—'} />
              <Row k="Telegram" v={<a className="text-accent" href={`https://t.me/${l.contact_telegram}`} target="_blank" rel="noreferrer">@{l.contact_telegram}</a>} />
              <Row k="Phone" v={l.contact_phone || '—'} />
              <p className="mb-1 mt-4 font-semibold">Payout</p>
              <Row k={l.payout_method} v={`${l.payout_account_name} · ${l.payout_account_number}`} />
              {l.has_payout_qr ? <PayoutQr src={`/api/admin/listings/${l.id}/payout-qr`} /> : <p className="mt-2 text-[12px] text-muted">No payout QR uploaded.</p>}
            </div>
          ) : <div className="card p-5 text-sm text-muted">TicketNest's own stock (no seller payout).</div>}
        </div>
      </div>
      <Modal open={rejecting} onClose={() => setRejecting(false)} title="Reject listing">
        <Field label="Reason (shown to the seller)"><textarea className="input min-h-[90px]" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. The proof doesn't show the seat number" /></Field>
        <button className="btn-danger mt-4 w-full" onClick={() => { act('reject', { reason }); setRejecting(false) }}>Reject listing</button>
      </Modal>
      <Modal open={!!edit} onClose={() => setEdit(null)} title="Edit listing">
        {edit && <div className="space-y-3">
          <Field label="Seller price (USD)"><input className="input" value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} /></Field>
          <Field label="Original price (USD)"><input className="input" value={edit.original_price} onChange={(e) => setEdit({ ...edit, original_price: e.target.value })} /></Field>
          <Field label="Quantity" hint={`Can't be below ${l.quantity_sold + l.quantity_reserved} (sold + held)`}><input className="input" type="number" value={edit.quantity} onChange={(e) => setEdit({ ...edit, quantity: Number(e.target.value) })} /></Field>
          <button className="btn-primary w-full" onClick={async () => {
            try { setL({ ...(await api(`/api/admin/listings/${id}`, { method: 'PATCH', body: edit })), orders: l.orders }); setEdit(null); toast('Saved') } catch (e) { toast(e.message, 'error') }
          }}>Save</button>
        </div>}
      </Modal>
    </div>
  )
}

export function PayoutQr({ src }) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    let u
    api(src, { raw: true }).then((r) => r.blob()).then((b) => { u = URL.createObjectURL(b); setUrl(u) }).catch(() => setUrl(false))
    return () => u && URL.revokeObjectURL(u)
  }, [src])
  if (url === false) return null
  return (
    <div className="mt-3 rounded-2xl border border-line bg-white p-3 text-center">
      {url ? <button onClick={() => viewFile({ path: src, name: 'seller-payout-qr.png' })} className="block w-full"><img src={url} alt="Seller payout QR" className="mx-auto max-h-64 rounded-lg" /></button> : <div className="skeleton mx-auto h-48 w-48" />}
      <p className="mt-2 text-[12px] text-neutral-500">Seller's payout QR — tap to enlarge or save</p>
    </div>
  )
}

function ManualListing({ open, onClose, onDone }) {
  const [concerts, setConcerts] = useState([])
  const [f, setF] = useState({ concert_id: '', category_id: '', price: '', original_price: '', quantity: 1, seat_info: '', notes: '', ticket_type: 'e_ticket' })
  const [error, setError] = useState(null)
  useEffect(() => { if (open) api('/api/admin/concerts').then(setConcerts) }, [open])
  const c = concerts.find((x) => x.id === Number(f.concert_id))
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const save = async () => {
    setError(null)
    try { await api('/api/admin/listings', { method: 'POST', body: { ...f, concert_id: Number(f.concert_id), category_id: Number(f.category_id), quantity: Number(f.quantity) } }); onDone() } catch (e) { setError(e) }
  }
  return (
    <Modal open={open} onClose={onClose} title="Add TicketNest tickets">
      <div className="space-y-3">
        <Field label="Concert"><select className="input" value={f.concert_id} onChange={(e) => setF({ ...f, concert_id: e.target.value, category_id: '' })}><option value="">Choose…</option>{concerts.map((x) => <option key={x.id} value={x.id}>{x.title} · {x.city}</option>)}</select></Field>
        <Field label="Category"><select className="input" value={f.category_id} onChange={set('category_id')}><option value="">Choose…</option>{c?.categories.filter((k) => k.is_active).map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</select></Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Price (USD)"><input className="input" value={f.price} onChange={set('price')} /></Field>
          <Field label="Face value"><input className="input" value={f.original_price} onChange={set('original_price')} /></Field>
          <Field label="Qty"><input className="input" type="number" min={1} value={f.quantity} onChange={set('quantity')} /></Field>
        </div>
        <Field label="Seat"><input className="input" value={f.seat_info} onChange={set('seat_info')} /></Field>
        <Field label="Notes"><input className="input" value={f.notes} onChange={set('notes')} /></Field>
        <p className="text-[12px] text-muted">Goes on sale immediately. The buyer markup applies; no seller commission.</p>
        <ErrorNote error={error} />
        <button className="btn-primary w-full" onClick={save}>Add tickets</button>
      </div>
    </Modal>
  )
}
