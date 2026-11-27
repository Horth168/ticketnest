import { Download, Plus, Search, ShieldCheck, Trash2, Upload, User, UserCog } from 'lucide-react'
import { confirmDialog } from '../../components/Dialog'
import { useCallback, useEffect, useState } from 'react'
import { Link, Route, Routes } from 'react-router-dom'
import { Avatar, Badge, Empty, ErrorNote, Field, Loading, Modal, Poster, Row } from '../../components/ui'
import { useApp } from '../../context/App'
import { api, openFile } from '../../lib/api'
import { cls, dateTime, pct, usd2 } from '../../lib/format'
import { H, Tabs } from './AdminApp'
import { PayoutQr } from './Listings'
import SeatMap, { CAT_COLORS, LAYOUTS } from '../../components/SeatMap'

export default function Ops() {
  return (
    <Routes>
      <Route path="payments" element={<Payments />} />
      <Route path="withdrawals" element={<Withdrawals />} />
      <Route path="concerts" element={<Concerts />} />
      <Route path="artists" element={<Artists />} />
      <Route path="users" element={<UsersPage />} />
      <Route path="reports" element={<Reports />} />
      <Route path="settings" element={<SettingsPage />} />
      <Route path="audit" element={<Audit />} />
      <Route path="reviews" element={<ReviewsPage />} />
      <Route path="backups" element={<BackupsPage />} />
      <Route path="*" element={<Empty title="Not found" />} />
    </Routes>
  )
}

// ------------------------------------------------------------------ payments
const OUT = { matched: 'good', resolved_manual: 'good', ambiguous: 'warn', unmatched: 'warn', wrong_amount: 'bad', late: 'bad' }
function Payments() {
  const { toast } = useApp()
  const [d, setD] = useState(null)
  const [tab, setTab] = useState('')
  const [assign, setAssign] = useState(null)
  const load = useCallback(() => api(`/api/admin/payments?outcome=${tab}`).then(setD), [tab])
  useEffect(() => { load() }, [load])
  if (!d) return <Loading />
  return (
    <div>
      <H title="Payments" sub="Every ABA PayWay notification the listener saw, and what happened to it." />
      <div className="card mb-6 p-4 text-sm">
        <b>Listener:</b> {d.listener.state}{d.listener.account && ` as ${d.listener.account}`}{d.listener.error && <span className="text-bad"> · {d.listener.error}</span>}
        <p className="mt-1 text-[12px] text-muted">Orders are confirmed automatically only when a genuine PayWay message matches exactly one pending order. Everything else waits here for you.</p>
      </div>
      <Tabs value={tab} onChange={setTab} options={[['', 'All notifications'], ['ambiguous,unmatched,wrong_amount,late', 'Needs attention'], ['matched,resolved_manual', 'Matched']]} />
      <div className="card mb-8 divide-y divide-line">
        {!d.notifications.length && <p className="p-5 text-sm text-muted">No PayWay notifications yet.</p>}
        {d.notifications.map((n) => (
          <div key={n.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
            <Badge tone={OUT[n.outcome]}>{n.outcome.replace('_', ' ')}</Badge>
            <b className="tabular-nums">{n.currency === 'USD' ? usd2(n.amount) : `${n.amount.toLocaleString()} KHR`}</b>
            <span>{n.payer} {n.payer_account}</span>
            <span className="text-muted">Trx {n.trx_id} · {dateTime(n.received_at)}</span>
            {n.detail && <span className="text-[12px] text-muted">· {n.detail}</span>}
            {['ambiguous', 'unmatched', 'late'].includes(n.outcome) && <button className="btn-ghost ml-auto py-1.5" onClick={() => setAssign(n)}>Assign to order</button>}
          </div>
        ))}
      </div>
      <h2 className="mb-3 text-lg font-bold">Payment records</h2>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[620px] text-sm"><tbody className="divide-y divide-line">
          {d.payments.map((p) => (
            <tr key={p.id}><td className="px-4 py-2.5"><Link className="font-semibold hover:text-accent" to={`/admin/orders/${p.order_id}`}>{p.order_number}</Link></td>
              <td className="tabular-nums">{p.currency === 'USD' ? usd2(p.amount) : `${p.amount} KHR`}</td><td><Badge tone={p.status === 'verified' ? 'good' : 'muted'}>{p.status}</Badge></td>
              <td className="text-muted">{p.reference || '—'}</td><td className="px-4 text-right text-muted">{dateTime(p.created_at)}</td></tr>
          ))}
        </tbody></table>
      </div>
      <AssignModal n={assign} onClose={() => setAssign(null)} onDone={() => { setAssign(null); toast('Payment assigned, order is paid'); load() }} />
    </div>
  )
}

function AssignModal({ n, onClose, onDone }) {
  const [orders, setOrders] = useState([])
  const [error, setError] = useState(null)
  useEffect(() => { if (n) api('/api/admin/orders?status=awaiting_payment,cancelled&size=100').then((r) => setOrders(r.items)) }, [n])
  if (!n) return null
  const match = orders.filter((o) => o.payments.some((p) => ['pending', 'expired'].includes(p.status) && p.amount === n.amount && p.currency === n.currency))
  return (
    <Modal open onClose={onClose} title={`Assign Trx ${n.trx_id}`}>
      <p className="mb-3 text-sm text-muted">Orders with an open QR for exactly this amount. Check the payer name against the buyer before confirming.</p>
      {!match.length && <p className="text-sm">No open order has this amount.</p>}
      {match.map((o) => (
        <button key={o.id} className="mb-2 flex w-full items-center justify-between rounded-xl border border-line p-3 text-left text-sm hover:border-accent"
          onClick={async () => { try { await api(`/api/admin/payments/notifications/${n.id}/assign`, { method: 'POST', body: { order_id: o.id } }); onDone() } catch (e) { setError(e) } }}>
          <span><b>{o.order_number}</b> · {o.contact.name}<span className="block text-[12px] text-muted">{dateTime(o.created_at)} · {o.status}</span></span><span>{usd2(o.total_cents)}</span>
        </button>
      ))}
      <ErrorNote error={error} />
    </Modal>
  )
}

// ------------------------------------------------------------------ withdrawals
function Withdrawals() {
  const { user, toast } = useApp()
  const [status, setStatus] = useState('pending')
  const [rows, setRows] = useState(null)
  const [settle, setSettle] = useState(null)
  const [qr, setQr] = useState(null)
  const load = useCallback(() => api(`/api/admin/withdrawals?status=${status}`).then(setRows), [status])
  useEffect(() => { load() }, [load])
  return (
    <div>
      <H title="Withdrawals" sub="Pay sellers from your bank app, then mark the request paid." />
      <Tabs value={status} onChange={setStatus} options={[['pending', 'Pending'], ['paid', 'Paid'], ['rejected', 'Rejected'], ['', 'All']]} />
      {!rows ? <Loading /> : !rows.length ? <Empty title="No withdrawals" /> : (
        <div className="card divide-y divide-line">
          {rows.map((w) => (
            <div key={w.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
              <div className="min-w-0 flex-1"><p className="font-semibold">#{w.id} · {w.seller.name}</p><p className="text-[12px] text-muted">{w.method} · {w.account_name} · <b>{w.account_number}</b> · {dateTime(w.created_at)}</p>
                {w.payout_reference && <p className="text-[12px] text-muted">Ref {w.payout_reference}</p>}</div>
              <b className="tabular-nums">{usd2(w.amount_cents)}</b><Badge tone={w.status === 'paid' ? 'good' : w.status === 'pending' ? 'warn' : 'muted'}>{w.status}</Badge>
              {w.seller.has_payout_qr && <button className="btn-ghost py-1.5" onClick={() => setQr(w)}>Payout QR</button>}
              {w.status === 'pending' && user.role === 'admin' && <><button className="btn-accent py-1.5" onClick={() => setSettle({ w, paid: true })}>Mark paid</button><button className="btn-ghost py-1.5" onClick={() => setSettle({ w, paid: false })}>Reject</button></>}
            </div>
          ))}
        </div>
      )}
      <SettleModal s={settle} onClose={() => setSettle(null)} onDone={() => { setSettle(null); toast('Saved'); load() }} />
      <QrModal w={qr} onClose={() => setQr(null)} />
    </div>
  )
}

function QrModal({ w, onClose }) {
  if (!w) return null
  return (
    <Modal open onClose={onClose} title={`Pay ${w.seller.name} · ${usd2(w.amount_cents)}`}>
      <p className="text-sm text-muted">{w.method} · {w.account_name} · {w.account_number}</p>
      <PayoutQr src={`/api/admin/users/${w.seller.id}/payout-qr`} />
    </Modal>
  )
}

function SettleModal({ s, onClose, onDone }) {
  const [ref, setRef] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState(null)
  if (!s) return null
  return (
    <Modal open onClose={onClose} title={s.paid ? `Mark ${usd2(s.w.amount_cents)} as paid` : 'Reject withdrawal'}>
      {s.paid && <Field label="Bank transfer reference"><input className="input" value={ref} onChange={(e) => setRef(e.target.value)} /></Field>}
      <Field label={s.paid ? 'Note (optional)' : 'Reason (shown to the seller)'} className="mt-3"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <ErrorNote error={error} />
      <button className={`${s.paid ? 'btn-accent' : 'btn-danger'} mt-4 w-full`} onClick={async () => {
        try { await api(`/api/admin/withdrawals/${s.w.id}/settle`, { method: 'POST', body: { paid: s.paid, reference: ref, note } }); onDone() } catch (e) { setError(e) }
      }}>{s.paid ? 'Confirm paid' : 'Reject and return to wallet'}</button>
    </Modal>
  )
}

// ------------------------------------------------------------------ concerts
const EMPTY_CONCERT = { artist_id: '', title: '', venue: '', city: '', country: '', starts_at: '', doors_open: '', description: '', poster_url: '', delivery_info: '', status: 'scheduled', is_featured: false, is_published: true, seat_layout: '', categories: [{ name: 'VIP' }, { name: 'CAT 1' }] }

async function uploadImage(file, folder) {
  const fd = new FormData(); fd.append('file', file)
  return (await api(`/api/admin/uploads/image?folder=${folder}`, { method: 'POST', form: fd })).url
}

function Concerts() {
  const { toast } = useApp()
  const [rows, setRows] = useState(null)
  const [artists, setArtists] = useState([])
  const [edit, setEdit] = useState(null)
  const load = useCallback(() => api('/api/admin/concerts').then(setRows), [])
  useEffect(() => { load(); api('/api/admin/artists').then(setArtists) }, [load])
  return (
    <div>
      <H title="Concerts" sub="Add real concerts with their official dates and venues."><button className="btn-primary" onClick={() => setEdit(EMPTY_CONCERT)}><Plus className="h-4 w-4" />Add concert</button></H>
      {!rows ? <Loading /> : !rows.length ? <Empty title="No concerts yet">Add the first concert so sellers can list tickets for it.</Empty> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((c) => (
            <button key={c.id} onClick={() => setEdit({ ...c, starts_at: c.starts_at.slice(0, 16) })} className="card overflow-hidden text-left transition hover:border-accent">
              <div className="aspect-[16/9]"><Poster src={c.poster_url} title={c.title} artist={c.artist.name} /></div>
              <div className="p-4"><p className="eyebrow">{c.artist.name}</p><p className="font-semibold">{c.title}</p><p className="text-[13px] text-muted">{c.city} · {dateTime(c.starts_at)}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">{c.is_demo && <Badge tone="warn">Demo</Badge>}{!c.is_published && <Badge>Unpublished</Badge>}{c.seat_layout && <Badge tone="accent">Seat map</Badge>}{c.is_featured && <Badge tone="accent">Featured</Badge>}{c.status !== 'scheduled' && <Badge tone="warn">{c.status}</Badge>}
                  {Object.entries(c.listing_counts).map(([k, v]) => <Badge key={k}>{v} {k}</Badge>)}</div></div>
            </button>
          ))}
        </div>
      )}
      <ConcertForm c={edit} artists={artists} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); toast('Concert saved'); load() }} />
    </div>
  )
}

const zoneList = (x) => (x.map_zones || '').split(',').filter(Boolean)

function ConcertForm({ c, artists, onClose, onSaved }) {
  const [f, setF] = useState(c)
  const [mapCat, setMapCat] = useState(0)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => setF(c), [c])
  if (!c || !f) return null
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  const setCat = (i, k, v) => setF({ ...f, categories: f.categories.map((x, j) => (j === i ? { ...x, [k]: v } : x)) })
  const save = async () => {
    setBusy(true); setError(null)
    const body = { ...f, artist_id: Number(f.artist_id), starts_at: new Date(f.starts_at).toISOString(),
      categories: f.categories.filter((x) => x.name?.trim()).map((x, i) => ({ id: x.id, name: x.name.trim(), description: x.description || '', face_value: x.face_value_cents != null ? x.face_value_cents / 100 : x.face_value || null, sort_order: i, is_active: x.is_active ?? true, map_zones: x.map_zones || '' })) }
    try { await api(c.id ? `/api/admin/concerts/${c.id}` : '/api/admin/concerts', { method: c.id ? 'PUT' : 'POST', body }); onSaved() } catch (e) { setError(e) } finally { setBusy(false) }
  }
  return (
    <Modal open onClose={onClose} title={c.id ? 'Edit concert' : 'Add concert'} wide>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Artist"><select className="input" value={f.artist_id} onChange={set('artist_id')}><option value="">Choose…</option>{artists.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
        <Field label="Concert name"><input className="input" value={f.title} onChange={set('title')} /></Field>
        <Field label="Venue"><input className="input" value={f.venue} onChange={set('venue')} /></Field>
        <Field label="Date & time (local)"><input className="input" type="datetime-local" value={f.starts_at} onChange={set('starts_at')} /></Field>
        <Field label="City"><input className="input" value={f.city} onChange={set('city')} /></Field>
        <Field label="Country"><input className="input" value={f.country} onChange={set('country')} /></Field>
        <Field label="Doors open"><input className="input" value={f.doors_open} onChange={set('doors_open')} placeholder="e.g. 17:30" /></Field>
        <Field label="Status"><select className="input" value={f.status} onChange={set('status')}>{['scheduled', 'postponed', 'cancelled', 'completed'].map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Seat map"><select className="input" value={f.seat_layout || ''} onChange={set('seat_layout')}><option value="">No seat map</option>{Object.entries(LAYOUTS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      </div>
      <Field label="Poster" className="mt-3">
        <div className="flex items-center gap-3">
          {f.poster_url && <img src={f.poster_url} alt="" className="h-16 w-24 rounded-lg object-cover" />}
          <label className="btn-ghost cursor-pointer"><Upload className="h-4 w-4" />Upload image<input type="file" accept="image/*" className="sr-only" onChange={async (e) => { try { setF({ ...f, poster_url: await uploadImage(e.target.files[0], 'posters') }) } catch (err) { setError(err) } }} /></label>
          {f.poster_url && <button className="text-sm text-muted hover:text-bad" onClick={() => setF({ ...f, poster_url: '' })}>Remove</button>}
        </div>
      </Field>
      <Field label="Description" className="mt-3"><textarea className="input min-h-[80px]" value={f.description} onChange={set('description')} /></Field>
      <Field label="Ticket delivery information (shown on the concert page)" className="mt-3"><textarea className="input min-h-[60px]" value={f.delivery_info} onChange={set('delivery_info')} placeholder="Leave empty for the standard Telegram delivery text" /></Field>
      <p className="label mt-4">Ticket categories</p>
      <div className="space-y-2">
        {f.categories.map((x, i) => (
          <div key={i} className="flex gap-2">
            {f.seat_layout && (
              <button type="button" title="Pick this category's zones on the map" onClick={() => setMapCat(i)}
                className={cls('grid h-[42px] w-11 shrink-0 place-items-center rounded-xl border transition', mapCat === i ? 'border-ink bg-raised' : 'border-line')}>
                <span className="h-4 w-4 rounded-full" style={{ background: CAT_COLORS[i % CAT_COLORS.length] }} />
              </button>
            )}
            <input className="input" placeholder="Name (VIP, CAT 1, Standing…)" value={x.name} onChange={(e) => setCat(i, 'name', e.target.value)} />
            <input className="input w-32" placeholder="Face value $" value={x.face_value ?? (x.face_value_cents != null ? x.face_value_cents / 100 : '')} onChange={(e) => setF({ ...f, categories: f.categories.map((y, j) => (j === i ? { ...y, face_value: e.target.value, face_value_cents: null } : y)) })} />
            <button className="btn-ghost px-3" aria-label="Remove category" onClick={() => setF({ ...f, categories: f.categories.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
        <button className="btn-ghost py-2" onClick={() => setF({ ...f, categories: [...f.categories, { name: '' }] })}><Plus className="h-4 w-4" />Category</button>
      </div>
      {f.seat_layout && f.categories.length > 0 && (
        <div className="mt-4 rounded-2xl border border-line p-3">
          <p className="text-[13px] font-semibold">Zones for <span style={{ color: CAT_COLORS[mapCat % CAT_COLORS.length] }}>{f.categories[mapCat]?.name || `category ${mapCat + 1}`}</span>
            <span className="font-normal text-muted"> · pick a category with its colour dot, then tap zones on the map ({zoneList(f.categories[mapCat] || {}).length} chosen)</span></p>
          <SeatMap layout={f.seat_layout} editColor
            categories={f.categories.map((x, i) => ({ id: i + 1, name: x.name || `Category ${i + 1}`, zones: zoneList(x), available: 1 }))}
            selected={null}
            onZone={(z) => setF({ ...f, categories: f.categories.map((x, i) => {
              const zs = zoneList(x).filter((y) => y !== z)
              if (i === mapCat && !zoneList(x).includes(z)) zs.push(z)
              return { ...x, map_zones: zs.join(',') }
            }) })}
            className="mx-auto max-w-[420px]" />
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-5 text-sm">
        {f.is_demo
          ? <span className="rounded-lg bg-warn/10 px-2.5 py-1 text-[13px] font-semibold text-warn">Demo concert: staff-only, can't be published or bought</span>
          : <label className="flex items-center gap-2"><input type="checkbox" checked={f.is_published} onChange={set('is_published')} />Published</label>}
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.is_featured} onChange={set('is_featured')} />Featured on homepage</label>
      </div>
      <ErrorNote error={error} />
      <div className="mt-5 flex gap-2">
        <button className="btn-primary flex-1" disabled={busy} onClick={save}>Save concert</button>
        {c.id && <button className="btn-danger" onClick={async () => { if (await confirmDialog({ title: 'Delete this concert?', message: 'If it already has listings it is unpublished instead, so order history stays intact.', confirmText: 'Delete', danger: true })) { await api(`/api/admin/concerts/${c.id}`, { method: 'DELETE' }); onSaved() } }}>Delete</button>}
      </div>
    </Modal>
  )
}

// ------------------------------------------------------------------ artists
function Artists() {
  const { toast } = useApp()
  const [rows, setRows] = useState(null)
  const [edit, setEdit] = useState(null)
  const load = useCallback(() => api('/api/admin/artists').then(setRows), [])
  useEffect(() => { load() }, [load])
  const save = async () => {
    try { await api(edit.id ? `/api/admin/artists/${edit.id}` : '/api/admin/artists', { method: edit.id ? 'PUT' : 'POST', body: edit }); setEdit(null); toast('Saved'); load() } catch (e) { toast(e.message, 'error') }
  }
  return (
    <div>
      <H title="Artists"><button className="btn-primary" onClick={() => setEdit({ name: '', genre: 'K-pop', agency: '', bio: '', image_url: '', is_popular: false, is_active: true })}><Plus className="h-4 w-4" />Add artist</button></H>
      {!rows ? <Loading /> : (
        <div className="card divide-y divide-line">
          {rows.map((a) => (
            <button key={a.id} onClick={() => setEdit(a)} className="flex w-full items-center gap-3 p-3.5 text-left hover:bg-raised">
              <div className="h-10 w-10 overflow-hidden rounded-full bg-raised">{a.image_url && <img src={a.image_url} alt="" className="h-full w-full object-cover" />}</div>
              <span className="flex-1 font-semibold">{a.name}<span className="ml-2 text-[12px] font-normal text-muted">{a.agency}</span></span>
              {a.is_popular && <Badge tone="accent">Popular</Badge>}{!a.is_active && <Badge>Hidden</Badge>}<span className="text-[12px] text-muted">{a.upcoming_concerts} concerts</span>
            </button>
          ))}
        </div>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit artist' : 'Add artist'}>
        {edit && <div className="space-y-3">
          <Field label="Name"><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-2"><Field label="Genre"><input className="input" value={edit.genre} onChange={(e) => setEdit({ ...edit, genre: e.target.value })} /></Field>
            <Field label="Agency"><input className="input" value={edit.agency} onChange={(e) => setEdit({ ...edit, agency: e.target.value })} /></Field></div>
          <Field label="Bio"><textarea className="input" value={edit.bio} onChange={(e) => setEdit({ ...edit, bio: e.target.value })} /></Field>
          <label className="btn-ghost cursor-pointer"><Upload className="h-4 w-4" />{edit.image_url ? 'Replace photo' : 'Upload photo'}<input type="file" accept="image/*" className="sr-only" onChange={async (e) => setEdit({ ...edit, image_url: await uploadImage(e.target.files[0], 'artists') })} /></label>
          <p className="text-[12px] text-muted">Use only photos you have the rights to.</p>
          <div className="flex gap-5 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={edit.is_popular} onChange={(e) => setEdit({ ...edit, is_popular: e.target.checked })} />Popular</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={edit.is_active} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })} />Visible</label></div>
          <button className="btn-primary w-full" onClick={save}>Save</button>
        </div>}
      </Modal>
    </div>
  )
}

// ------------------------------------------------------------------ users
const ROLE = {
  admin: { label: 'Admin', icon: ShieldCheck, badge: 'bg-accent text-accent-ink', ring: 'ring-accent', row: 'bg-accent/[.04]' },
  staff: { label: 'Staff', icon: UserCog, badge: 'bg-warn/15 text-warn', ring: 'ring-warn', row: 'bg-warn/[.04]' },
  customer: { label: 'Customer', icon: User, badge: 'bg-muted/10 text-muted', ring: 'ring-transparent', row: '' },
}
const RANK = { admin: 0, staff: 1, customer: 2 }

function UsersPage() {
  const { user, toast } = useApp()
  const [q, setQ] = useState('')
  const [tab, setTab] = useState('all')
  const [rows, setRows] = useState(null)
  const load = useCallback(() => api(`/api/admin/users?q=${encodeURIComponent(q)}`).then(setRows).catch((e) => toast(e.message, 'error')), [q, toast])
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t) }, [load])
  const patch = async (u, body) => {
    if (body.role === 'admin' && !(await confirmDialog({ title: `Make ${u.full_name} an admin?`, message: 'Admins can change settings, roles and payouts.', confirmText: 'Make admin' }))) return
    if (body.is_active === false && !(await confirmDialog({ title: `Disable ${u.full_name}?`, message: "They won't be able to sign in or use their account.", confirmText: 'Disable', danger: true }))) return
    try { await api(`/api/admin/users/${u.id}`, { method: 'PATCH', body }); toast('Saved'); load() } catch (e) { toast(e.message, 'error') }
  }
  const all = rows || []
  const count = { all: all.length, team: all.filter((u) => u.role !== 'customer').length, customer: all.filter((u) => u.role === 'customer').length, disabled: all.filter((u) => !u.is_active).length }
  const shown = all
    .filter((u) => tab === 'all' || (tab === 'team' ? u.role !== 'customer' : tab === 'disabled' ? !u.is_active : u.role === tab))
    .sort((x, y) => RANK[x.role] - RANK[y.role] || y.id - x.id)
  const canEdit = (u) => user.role === 'admin' && u.id !== user.id
  return (
    <div>
      <H title="Users" sub={rows ? `${count.all} account${count.all === 1 ? "" : "s"} · ${count.team} on the team` : undefined} />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
          {[['all', 'All'], ['team', 'Team'], ['customer', 'Customers'], ['disabled', 'Disabled']].map(([v, l]) => (
            <button key={v} onClick={() => setTab(v)} className={cls('chip shrink-0', tab === v && '!border-ink bg-ink !text-bg')}>
              {l}<span className={cls('tabular-nums', tab === v ? 'text-bg/60' : 'text-muted')}>{count[v]}</span>
            </button>
          ))}
        </div>
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="input pl-9" placeholder="Search name, email, Telegram" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      {!rows ? <Loading /> : !shown.length ? <Empty title="No users found" /> : (
        <div className="card divide-y divide-line overflow-hidden">
          {shown.map((u) => {
            const r = ROLE[u.role] || ROLE.customer
            return (
              <div key={u.id} className={cls('flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4', r.row, !u.is_active && 'opacity-60')}>
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar user={u} size={44} className={cls('ring-2 ring-offset-2 ring-offset-surface', r.ring)} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="truncate font-semibold">{u.full_name}</p>
                      <span className={cls('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold', r.badge)}><r.icon className="h-3 w-3" />{r.label}</span>
                      {u.id === user.id && <span className="rounded-full bg-ink px-2 py-0.5 text-[11px] font-bold text-bg">You</span>}
                      {!u.is_active && <Badge tone="bad">Disabled</Badge>}
                    </div>
                    <p className="truncate text-[13px] text-muted">{u.email || 'No email'}{u.telegram_username && ` · @${u.telegram_username}`}</p>
                    <p className="mt-0.5 text-[12px] text-muted">
                      Joined {new Date(u.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {' · '}{u.orders} order{u.orders === 1 ? '' : 's'} · {u.listings} listing{u.listings === 1 ? '' : 's'}
                      {' · '}{(u.providers.length ? u.providers : ['email']).join(', ')}
                    </p>
                  </div>
                </div>
                {canEdit(u) && (
                  <div className="flex items-center gap-2 pl-[56px] sm:pl-0">
                    <select className="input w-auto py-2 text-[13px]" value={u.role} onChange={(e) => patch(u, { role: e.target.value })} aria-label="Role">
                      <option value="customer">Customer</option><option value="staff">Staff</option><option value="admin">Admin</option>
                    </select>
                    <button className={cls('py-2 text-[13px]', u.is_active ? 'btn-ghost hover:!text-bad' : 'btn-accent')} onClick={() => patch(u, { is_active: !u.is_active })}>
                      {u.is_active ? 'Disable' : 'Enable'}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ reports
function Reports() {
  const [txs, setTxs] = useState(null)
  const { user } = useApp()
  useEffect(() => { if (user.role === 'admin') api('/api/admin/wallet-transactions').then(setTxs) }, [user.role])
  return (
    <div>
      <H title="Reports">{user.role === 'admin' && <button className="btn-primary" onClick={() => openFile('/api/admin/reports/orders.csv', 'ticketnest-orders.csv', true)}><Download className="h-4 w-4" />Export orders (CSV)</button>}</H>
      <p className="mb-6 text-sm text-muted">The CSV includes every order with seller price, buyer markup, commission, seller payout, platform revenue, invoice and payment reference — ready for your accounting.</p>
      <h2 className="mb-3 text-lg font-bold">Seller wallet transactions</h2>
      {!txs ? <Loading /> : !txs.length ? <Empty title="No wallet activity yet" /> : (
        <div className="card divide-y divide-line">{txs.map((t) => (
          <div key={t.id} className="flex flex-wrap items-center gap-3 p-3.5 text-sm"><span className="flex-1"><b>{t.seller}</b> · {t.type.replace(/_/g, ' ')} <span className="text-muted">· {t.note}</span></span>
            <span className="tabular-nums">{usd2(t.amount_cents)}</span><span className="text-[12px] text-muted">avail {usd2(t.available_after)} · pending {usd2(t.pending_after)} · {dateTime(t.created_at)}</span></div>
        ))}</div>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ settings
function SettingsPage() {
  const { toast } = useApp()
  const [s, setS] = useState(null)
  const [tab, setTab] = useState('fees')
  const [preview, setPreview] = useState(null)
  const load = useCallback(() => api('/api/admin/settings').then(setS), [])
  useEffect(() => { load() }, [load])
  if (!s) return <Loading />
  const put = async (key, body) => { try { await api(`/api/admin/settings/${key}`, { method: 'PUT', body }); toast('Settings saved'); load() } catch (e) { toast(e.message, 'error') } }
  const bind = (key, k, num) => ({ value: s[key][k] ?? '', onChange: (e) => setS({ ...s, [key]: { ...s[key], [k]: num ? Number(e.target.value) : e.target.value } }) })
  const readQr = async (file) => {
    if (!('BarcodeDetector' in window)) { toast('Your browser cannot read QR images. Paste the KHQR text instead.', 'error'); return }
    const codes = await new window.BarcodeDetector({ formats: ['qr_code'] }).detect(await createImageBitmap(file))
    if (!codes[0]) { toast('No QR code found in that image', 'error'); return }
    setS({ ...s, payments: { ...s.payments, khqr_template: codes[0].rawValue } })
  }
  const i = s.integrations
  return (
    <div className="max-w-3xl">
      <H title="Settings" sub="Secrets (bot tokens, API keys, passwords) are set as server environment variables and never shown here." />
      <Tabs value={tab} onChange={setTab} options={[['fees', 'Fees'], ['protection', 'Buyer protection'], ['payments', 'Payments'], ['telegram', 'Telegram'], ['site', 'Website'], ['currency', 'Currency'], ['system', 'System']]} />
      <div className="card space-y-4 p-5 sm:p-6">
        {tab === 'fees' && <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Seller commission (%)" hint={`Now ${pct(s.fees.seller_commission_bps)}`}><input className="input" inputMode="decimal" value={s.fees.seller_commission_bps / 100} onChange={(e) => setS({ ...s, fees: { ...s.fees, seller_commission_bps: Math.round(Number(e.target.value) * 100) } })} /></Field>
            <Field label="Buyer markup (%)" hint={`Now ${pct(s.fees.buyer_markup_bps)}`}><input className="input" inputMode="decimal" value={s.fees.buyer_markup_bps / 100} onChange={(e) => setS({ ...s, fees: { ...s.fees, buyer_markup_bps: Math.round(Number(e.target.value) * 100) } })} /></Field>
          </div>
          <div className="rounded-xl bg-raised p-4 text-sm"><p className="mb-1 font-semibold">Example: $100 listing</p>
            <Row k="Buyer pays" v={usd2(10000 + Math.round(10000 * s.fees.buyer_markup_bps / 10000))} /><Row k="Seller receives" v={usd2(10000 - Math.round(10000 * s.fees.seller_commission_bps / 10000))} />
            <Row k="TicketNest gross" v={usd2(Math.round(10000 * (s.fees.buyer_markup_bps + s.fees.seller_commission_bps) / 10000))} strong /></div>
          <p className="text-[12px] text-muted">Changes apply to new checkouts. Existing orders keep the fees they were created with.</p>
          <button className="btn-primary" onClick={() => put('fees', s.fees)}>Save fees</button>
        </>}
        {tab === 'protection' && s.protection && <>
          <label className="flex items-start gap-3 rounded-2xl border border-line p-4 text-sm">
            <input type="checkbox" className="mt-0.5" checked={s.protection.hold_until_after_event} onChange={(e) => setS({ ...s, protection: { ...s.protection, hold_until_after_event: e.target.checked } })} />
            <span><b>Pay sellers only after the concert</b><span className="mt-0.5 block text-muted">Seller earnings stay pending until the hours below after the concert starts, then are released automatically. A buyer's problem report freezes them.</span></span>
          </label>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Release payout (hours after start)"><input className="input" type="number" min="0" {...bind('protection', 'payout_hold_hours', true)} /></Field>
            <Field label="Buyers can report until (hours after start)"><input className="input" type="number" min="0" {...bind('protection', 'report_window_hours', true)} /></Field>
            <Field label="Price cap (% of face value)" hint="0 = no cap. e.g. 150 = at most 1.5× face value"><input className="input" type="number" min="0" {...bind('protection', 'price_cap_pct', true)} /></Field>
          </div>
          <p className="text-[12px] text-muted">Keep the report window at least as long as the payout hold, so a buyer can always report before the seller is paid. Existing listings above a new price cap stay on sale; the cap applies to new listings and edits.</p>
          <button className="btn-primary" onClick={() => put('protection', s.protection)}>Save buyer protection</button>
        </>}
        {tab === 'payments' && <>
          <Field label="Your ABA merchant KHQR code" hint="Every order gets its own QR built from this code, with the exact amount and order number.">
            <textarea className="input min-h-[90px] font-mono text-[12px]" {...bind('payments', 'khqr_template')} placeholder="00020101021229…" />
          </Field>
          <div className="flex flex-wrap gap-2">
            <label className="btn-ghost cursor-pointer"><Upload className="h-4 w-4" />Read from QR image<input type="file" accept="image/*" className="sr-only" onChange={(e) => e.target.files[0] && readQr(e.target.files[0])} /></label>
            <button className="btn-ghost" onClick={async () => { try { setPreview(await api('/api/admin/settings/khqr/preview', { method: 'POST', body: { template: s.payments.khqr_template } })) } catch (e) { setPreview({ error: e.message }) } }}>Check code</button>
          </div>
          {(preview || s.payments.khqr_account) && <div className="rounded-xl bg-raised p-4 text-sm">{(preview || s.payments.khqr_account).error ? <span className="text-bad">{preview.error}</span> : <>
            <p className="font-semibold">Payments go to:</p><Row k="Name" v={(preview || s.payments.khqr_account).name} /><Row k="Bakong ID" v={(preview || s.payments.khqr_account).bakong_id} /><Row k="Account" v={(preview || s.payments.khqr_account).account || '—'} /></>}</div>}
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="QR currency"><select className="input" {...bind('payments', 'khqr_currency')}><option>USD</option><option>KHR</option></select></Field>
            <Field label="QR / ticket hold (minutes)"><input className="input" type="number" {...bind('payments', 'qr_expiry_minutes', true)} /></Field>
            <Field label="Late payment grace (minutes)"><input className="input" type="number" {...bind('payments', 'grace_minutes', true)} /></Field>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.payments.khqr_enabled} onChange={(e) => setS({ ...s, payments: { ...s.payments, khqr_enabled: e.target.checked } })} />KHQR checkout enabled</label>
          <button className="btn-primary" onClick={() => put('payments', s.payments)}>Save payment settings</button>
        </>}
        {tab === 'telegram' && <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Support Telegram username" hint="Shown on Support / Contact buttons"><input className="input" {...bind('telegram', 'support_username')} placeholder="ticketnest_support" /></Field>
            <Field label="Delivery Telegram username" hint="The account that sends tickets to buyers"><input className="input" {...bind('telegram', 'delivery_username')} placeholder="ticketnest" /></Field>
          </div>
          <Field label="Mini App link" hint="From BotFather, e.g. https://t.me/YourBot/app"><input className="input" {...bind('telegram', 'mini_app_url')} /></Field>
          <div className="grid gap-4 rounded-2xl border border-line p-4 sm:grid-cols-[1fr_160px] sm:items-end">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.telegram.daily_report} onChange={(e) => setS({ ...s, telegram: { ...s.telegram, daily_report: e.target.checked } })} />Send a daily report to the admin group</label>
            <Field label="Report time (Phnom Penh)"><select className="input" value={s.telegram.daily_report_hour} onChange={(e) => setS({ ...s, telegram: { ...s.telegram, daily_report_hour: Number(e.target.value) } })}>
              {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}</select></Field>
          </div>
          <div className="flex flex-wrap gap-5 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={s.telegram.admin_alerts} onChange={(e) => setS({ ...s, telegram: { ...s.telegram, admin_alerts: e.target.checked } })} />Admin alerts</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={s.telegram.customer_updates} onChange={(e) => setS({ ...s, telegram: { ...s.telegram, customer_updates: e.target.checked } })} />Customer order updates</label>
          </div>
          <div className="flex gap-2"><button className="btn-primary" onClick={() => put('telegram', s.telegram)}>Save</button>
            <button className="btn-ghost" onClick={async () => { try { const r = await api('/api/admin/settings/test-telegram', { method: 'POST' }); toast(r.ok ? 'Test alert sent' : 'Telegram refused the message', r.ok ? 'info' : 'error') } catch (e) { toast(e.message, 'error') } }}>Send test alert</button></div>
        </>}
        {tab === 'site' && <>
          <Field label="Website name"><input className="input" {...bind('site', 'name')} /></Field>
          <Field label="Tagline"><input className="input" {...bind('site', 'tagline')} /></Field>
          <Field label="Contact email"><input className="input" {...bind('site', 'contact_email')} /></Field>
          <Field label="Logo">
            <div className="flex items-center gap-3">{s.site.logo_url && <img src={s.site.logo_url} alt="" className="h-10" />}
              <label className="btn-ghost cursor-pointer"><Upload className="h-4 w-4" />Upload<input type="file" accept="image/*" className="sr-only" onChange={async (e) => setS({ ...s, site: { ...s.site, logo_url: await uploadImage(e.target.files[0], 'brand') } })} /></label></div>
          </Field>
          <button className="btn-primary" onClick={() => put('site', s.site)}>Save</button>
        </>}
        {tab === 'currency' && <>
          <Field label="USD → KHR rate" hint="Used to show riel totals and for riel QRs"><input className="input" type="number" {...bind('currency', 'khr_rate', true)} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.currency.show_khr} onChange={(e) => setS({ ...s, currency: { ...s.currency, show_khr: e.target.checked } })} />Show riel amounts</label>
          <Field label="Low-stock alert at (tickets left)"><input className="input" type="number" value={s.inventory.low_stock_threshold} onChange={(e) => setS({ ...s, inventory: { low_stock_threshold: Number(e.target.value) } })} /></Field>
          <div className="flex gap-2"><button className="btn-primary" onClick={() => put('currency', s.currency)}>Save currency</button><button className="btn-ghost" onClick={() => put('inventory', s.inventory)}>Save stock alert</button></div>
        </>}
        {tab === 'system' && <div className="text-sm">
          <p className="mb-2 text-muted">Configured on the server (environment variables). Status only.</p>
          {[['Telegram bot token', i.telegram_bot], ['Admin alert group', i.admin_group], [`Admin Telegram IDs (${i.admin_ids})`, i.admin_ids > 0], ['Payment group', i.payment_group],
            [`PayWay listener (${i.listener})`, i.listener === 'connected'], ['Bakong API', i.bakong_api], [`Email provider (${i.email})`, i.email !== 'none'], ['Google client ID', i.google], [`File storage (${i.storage})`, true]]
            .map(([l, ok]) => <Row key={l} k={l} v={ok ? <span className="text-good">configured</span> : <span className="text-muted">not set</span>} />)}
        </div>}
      </div>
    </div>
  )
}

function Audit() {
  const [rows, setRows] = useState(null)
  const [q, setQ] = useState('')
  useEffect(() => { api(`/api/admin/audit?action=${encodeURIComponent(q)}`).then(setRows) }, [q])
  return (
    <div>
      <H title="Audit log" sub="Every important action, with who did it." />
      <input className="input mb-4 max-w-xs" placeholder="Filter, e.g. payment, listing, withdrawal" value={q} onChange={(e) => setQ(e.target.value)} />
      {!rows ? <Loading /> : <div className="card divide-y divide-line">{rows.map((a) => (
        <div key={a.id} className="flex flex-wrap gap-x-3 p-3 text-sm"><b>{a.action}</b><span className="text-muted">{a.entity} #{a.entity_id}</span><span>{a.actor}</span><span className="ml-auto text-[12px] text-muted">{dateTime(a.at)}</span>
          {a.data && <code className="w-full truncate text-[11px] text-muted">{JSON.stringify(a.data)}</code>}</div>
      ))}</div>}
    </div>
  )
}

// ------------------------------------------------------------------ reviews
const Stars = ({ n }) => <span className="tracking-tight text-[#F5B301]">{'★'.repeat(n)}<span className="text-line">{'★'.repeat(5 - n)}</span></span>

function ReviewsPage() {
  const { toast } = useApp()
  const [tab, setTab] = useState('pending')
  const [data, setData] = useState(null)
  const load = useCallback(() => api(`/api/admin/reviews?status=${tab}`).then(setData), [tab])
  useEffect(() => { setData(null); load() }, [load])
  const act = async (r, action) => {
    try {
      if (action === 'delete') { if (!(await confirmDialog({ title: 'Delete this review?', message: 'This cannot be undone.', confirmText: 'Delete', danger: true }))) return; await api(`/api/admin/reviews/${r.id}`, { method: 'DELETE' }) }
      else await api(`/api/admin/reviews/${r.id}/${action}`, { method: 'POST' })
      toast(action === 'approve' ? 'Review published' : action === 'reject' ? 'Review rejected' : 'Review deleted'); load()
    } catch (e) { toast(e.message, 'error') }
  }
  const c = data?.counts || {}
  return (
    <div>
      <H title="Reviews" sub="Customers write reviews from the homepage. Only approved reviews appear in the slider." />
      <Tabs value={tab} onChange={setTab} options={[['pending', `Pending ${c.pending || 0}`], ['approved', `Approved ${c.approved || 0}`], ['rejected', `Rejected ${c.rejected || 0}`], ['sample', `Samples ${c.sample || 0}`]]} />
      {tab === 'sample' && <p className="mb-4 rounded-xl bg-warn/10 px-4 py-3 text-[13px] text-warn">Samples are preview text written by TicketNest so you can see the slider before real reviews arrive. Only staff see them (on the homepage, while signed in), and they cannot be published as customer reviews. Delete them once real reviews come in.</p>}
      {!data ? <Loading /> : !data.reviews.length ? <Empty title="Nothing here">{tab === 'pending' ? 'New reviews waiting for approval appear here.' : 'No reviews in this list.'}</Empty> : (
        <div className="grid gap-3 md:grid-cols-2">
          {data.reviews.map((r) => (
            <div key={r.id} className="card flex flex-col p-4">
              <div className="flex items-center gap-3">
                <Avatar user={{ full_name: r.name, avatar_url: r.avatar_url }} size={38} />
                <div className="min-w-0 flex-1"><p className="truncate font-semibold">{r.name}</p><p className="truncate text-[12px] text-muted">{r.email || (r.is_sample ? 'Sample content' : 'Account deleted')} · {dateTime(r.created_at)}</p></div>
                <Stars n={r.rating} />
              </div>
              <p className="mt-3 flex-1 text-sm leading-relaxed">“{r.text}”</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {r.role && <Badge tone="good">Verified {r.role}</Badge>}
                {r.is_sample ? <Badge tone="warn">Sample</Badge> : <Badge tone={r.status === 'approved' ? 'good' : r.status === 'rejected' ? 'bad' : 'warn'}>{r.status}</Badge>}
                <span className="flex-1" />
                {!r.is_sample && r.status !== 'approved' && <button className="btn-primary py-1.5" onClick={() => act(r, 'approve')}>Approve</button>}
                {!r.is_sample && r.status !== 'rejected' && <button className="btn-ghost py-1.5" onClick={() => act(r, 'reject')}>{r.status === 'approved' ? 'Unpublish' : 'Reject'}</button>}
                <button className="btn-ghost px-2.5 py-1.5 text-bad" aria-label="Delete" onClick={() => act(r, 'delete')}><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ backups
const mb = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

function BackupsPage() {
  const { toast } = useApp()
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => api('/api/admin/backups').then(setData).catch((e) => toast(e.message, 'error')), [toast])
  useEffect(() => { load() }, [load])
  const now = async () => {
    setBusy(true)
    try { const r = await api('/api/admin/backups', { method: 'POST' }); toast(`Backup saved (${mb(r.size)})`); load() } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }
  return (
    <div>
      <H title="Backups" sub={data ? `Every table is saved automatically each day after ${String(data.hour).padStart(2, '0')}:00 (Phnom Penh time) to your private Cloudflare storage. The last ${data.keep_days} are kept.` : ''}>
        <button className="btn-primary" disabled={busy} onClick={now}>{busy ? 'Backing up…' : 'Back up now'}</button>
      </H>
      {data?.last && <p className="mb-4 rounded-xl bg-good/10 px-4 py-3 text-[13px] text-good">Last backup: {dateTime(data.last.at)} · {data.last.rows} rows · {mb(data.last.size)}</p>}
      {!data ? <Loading /> : !data.files.length ? <Empty title="No backups yet">The first one runs within a few minutes of the API starting, or press “Back up now”.</Empty> : (
        <div className="card divide-y divide-line">
          {data.files.map((f) => (
            <div key={f.name} className="flex items-center gap-3 p-3.5 text-sm">
              <span className="min-w-0 flex-1"><span className="block truncate font-medium">{f.name}</span><span className="text-[12px] text-muted">{dateTime(f.created_at)} · {mb(f.size)}</span></span>
              <button className="btn-ghost py-1.5" onClick={() => openFile(`/api/admin/backups/${f.name}`, f.name, true)}><Download className="h-4 w-4" />Download</button>
            </div>
          ))}
        </div>
      )}
      <p className="mt-4 text-[12px] leading-relaxed text-muted">Backups contain customer data: keep downloaded files private. To restore one into a new empty database, run <code className="rounded bg-raised px-1">alembic upgrade head</code> and then <code className="rounded bg-raised px-1">python scripts/restore_backup.py FILE</code> in the backend folder.</p>
      <LaunchCleanup onDone={load} />
    </div>
  )
}

// One-time cleanup before going public: keeps admin/staff accounts, artists, settings and ONE concert;
// deletes every other concert, all test orders, payments, wallets, withdrawals, listings, reviews and
// customer accounts. A full backup is saved first.
function LaunchCleanup({ onDone }) {
  const { toast, user } = useApp()
  const [concerts, setConcerts] = useState([])
  const [keep, setKeep] = useState('')
  const [plan, setPlan] = useState(null)
  const [word, setWord] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  useEffect(() => { if (user?.role === 'admin') api('/api/admin/concerts').then(setConcerts).catch(() => {}) }, [user])
  useEffect(() => {
    setPlan(null); setWord('')
    if (keep) api(`/api/admin/launch-reset?keep_concert_id=${keep}`).then(setPlan).catch((e) => toast(e.message, 'error'))
  }, [keep, toast])
  if (user?.role !== 'admin') return null
  const run = async () => {
    const ok = await confirmDialog({ title: 'Delete all test data?', message: `${plan.total} records will be permanently deleted. A backup is saved first.`, confirmText: 'Delete', danger: true })
    if (!ok) return
    setBusy(true)
    try {
      const r = await api('/api/admin/launch-reset', { method: 'POST', body: { keep_concert_id: Number(keep), confirm: word } })
      setResult(r); setPlan(null); setKeep(''); toast(`Deleted ${r.total} records`); onDone?.()
      api('/api/admin/concerts').then(setConcerts).catch(() => {})
    } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }
  return (
    <div className="card mt-8 border-bad/30 p-5">
      <p className="flex items-center gap-2 font-semibold text-bad"><Trash2 className="h-4 w-4" />Launch cleanup</p>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">Use once before going public. Keeps admin and staff accounts, artists, settings and the one concert you choose. Deletes every other concert and all test orders, payments, wallets, withdrawals, listings, reviews and customer accounts. A full backup is saved first.</p>
      <div className="mt-4" />
      <Field label="Concert to keep">
        <select className="input" value={keep} onChange={(e) => setKeep(e.target.value)}>
          <option value="">Choose…</option>
          {concerts.map((c) => <option key={c.id} value={c.id}>{c.title} · {c.city}</option>)}
        </select>
      </Field>
      {keep && !plan && <Loading />}
      {plan && (
        <div className="mt-4 space-y-3 text-sm">
          <p className="rounded-xl bg-good/10 p-3 text-[13px] text-good">Keeps <b>{plan.keep_concert.title}</b> ({plan.keep_concert.categories} categories) and {plan.kept_accounts.length} account{plan.kept_accounts.length === 1 ? '' : 's'}: {plan.kept_accounts.map((a) => `${a.name} (${a.role})`).join(', ')}.</p>
          {plan.concerts_removed.length > 0 && <p className="text-[13px] text-muted">Concerts removed: {plan.concerts_removed.map((c) => c.title).join(', ')}</p>}
          <div className="rounded-xl border border-line px-3 py-1">
            {plan.delete.filter((r) => r.count).map((r) => <Row key={r.label} k={r.label} v={r.count} />)}
            <Row k="Total to delete" v={plan.total} strong />
          </div>
          <Field label={`Type ${plan.confirm_word} to confirm`}><input className="input" value={word} onChange={(e) => setWord(e.target.value)} autoCapitalize="characters" autoComplete="off" /></Field>
          <button className="btn-danger w-full" disabled={busy || !plan.total || word.trim().toUpperCase() !== plan.confirm_word} onClick={run}>{busy ? 'Backing up and deleting…' : `Delete ${plan.total} records`}</button>
        </div>
      )}
      {result && <p className="mt-4 rounded-xl bg-good/10 p-3 text-[13px] text-good">Done: {result.total} records deleted. Backup saved first as {result.backup}.</p>}
    </div>
  )
}
