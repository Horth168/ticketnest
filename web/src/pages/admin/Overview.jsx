import { AlertTriangle, ArrowUpRight, CheckCircle2, CircleDashed, DollarSign, Package, Send, Ticket, TrendingUp } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ErrorNote, Loading, OrderBadge } from '../../components/ui'
import { useApp } from '../../context/App'
import { api } from '../../lib/api'
import { cls, dateTime, usd, usd2 } from '../../lib/format'
import { H } from './AdminApp'

const STATUS_COLORS = { available: '#10B981', pending: '#F59E0B', reserved: '#6D4BFF', sold: '#64748B', rejected: '#EF4444', cancelled: '#A1A1AA', disabled: '#F97316', approved: '#22C55E' }

function KPI({ icon: Icon, label, value, hint, tone = 'accent', to }) {
  const body = (
    <div className="card card-hover h-full p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <span className={cls('grid h-9 w-9 place-items-center rounded-xl', { accent: 'bg-accent/10 text-accent', good: 'bg-good/10 text-good', warn: 'bg-warn/10 text-warn' }[tone])}><Icon className="h-[18px] w-[18px]" /></span>
        {to && <ArrowUpRight className="h-4 w-4 text-muted" />}
      </div>
      <p className="mt-3 text-[12px] font-medium text-muted">{label}</p>
      <p className="mt-0.5 font-display text-2xl font-bold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-[12px] text-muted">{hint}</p>}
    </div>
  )
  return to ? <Link to={to}>{body}</Link> : body
}

const day = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

function niceMax(v) {
  if (v <= 4) return 4
  const p = 10 ** Math.floor(Math.log10(v)), n = v / p
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p
}

// Clean area chart: soft gradient fill, three gridlines with labels, a hover crosshair + tooltip.
function AreaChart({ data, metric }) {
  const box = useRef(null)
  const [w, setW] = useState(640)
  const [hover, setHover] = useState(null)
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, e.contentRect.width)))
    ro.observe(box.current)
    return () => ro.disconnect()
  }, [])
  const money = metric !== 'tickets'
  const fmt = (v) => (money ? usd(v) : `${v}`)
  const H = 200, padL = money ? 52 : 30, padR = 8, padT = 12, padB = 26
  const top = niceMax(Math.max(...data.map((d) => d[metric]), 0))
  const iw = w - padL - padR, ih = H - padT - padB
  const x = (i) => padL + (data.length === 1 ? iw / 2 : (i / (data.length - 1)) * iw)
  const y = (v) => padT + ih - (v / top) * ih
  const pts = data.map((d, i) => [x(i), y(d[metric])])
  const line = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join('')
  const area = `${line}L${x(data.length - 1)},${padT + ih}L${x(0)},${padT + ih}Z`
  const ticks = [0, top / 2, top]
  const labelEvery = Math.ceil(data.length / (w < 420 ? 4 : 7))
  const move = (e) => {
    const r = box.current.getBoundingClientRect()
    const i = Math.round(((e.clientX - r.left - padL) / iw) * (data.length - 1))
    setHover(Math.min(data.length - 1, Math.max(0, i)))
  }
  const h = hover !== null ? data[hover] : null
  return (
    <div ref={box} className="relative select-none" onMouseMove={move} onMouseLeave={() => setHover(null)} onTouchStart={(e) => move(e.touches[0])} onTouchMove={(e) => move(e.touches[0])}>
      <svg width={w} height={H} className="block overflow-visible text-accent">
        <defs>
          <linearGradient id="area-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity=".28" /><stop offset="1" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} className="stroke-line" strokeDasharray={t ? '3 4' : undefined} />
            <text x={padL - 8} y={y(t)} textAnchor="end" dominantBaseline="central" className="fill-muted text-[11px] tabular-nums">{fmt(t)}</text>
          </g>
        ))}
        <path d={area} fill="url(#area-fill)" className="page-in" />
        <path d={line} fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" className="line-draw" style={{ '--len': 3000 }} />
        {data.map((d, i) => ((i % labelEvery === 0 && data.length - 1 - i >= labelEvery * 0.7) || i === data.length - 1) && (
          <text key={d.date} x={x(i)} y={H - 6} textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'} className="fill-muted text-[11px]">
            {i === data.length - 1 ? 'Today' : day(d.date)}
          </text>
        ))}
        {h && (
          <g>
            <line x1={pts[hover][0]} x2={pts[hover][0]} y1={padT} y2={padT + ih} className="stroke-muted/40" strokeDasharray="2 3" />
            <circle cx={pts[hover][0]} cy={pts[hover][1]} r="5" fill="currentColor" className="stroke-surface" strokeWidth="2.5" />
          </g>
        )}
      </svg>
      {h && (
        <div className="pointer-events-none absolute top-0 whitespace-nowrap rounded-lg bg-ink px-2.5 py-1.5 text-[12px] text-bg shadow-lift"
          style={{ left: Math.min(Math.max(pts[hover][0], 60), w - 60), transform: 'translate(-50%, -110%)' }}>
          <span className="text-bg/70">{day(h.date)}</span> · <b>{money ? usd2(h[metric]) : `${h[metric]} ticket${h[metric] === 1 ? '' : 's'}`}</b>
          {h.orders > 0 && <span className="text-bg/70"> · {h.orders} order{h.orders === 1 ? '' : 's'}</span>}
        </div>
      )}
    </div>
  )
}

function Segmented({ value, onChange, options }) {
  return (
    <div className="inline-flex rounded-xl bg-raised p-1">
      {options.map(([v, l]) => (
        <button key={v} onClick={() => onChange(v)}
          className={cls('rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition', value === v ? 'bg-surface text-ink shadow-[0_1px_3px_rgba(0,0,0,.12)]' : 'text-muted hover:text-ink')}>{l}</button>
      ))}
    </div>
  )
}

function Donut({ counts }) {
  const entries = Object.entries(counts).filter(([, v]) => v > 0)
  const total = entries.reduce((a, [, v]) => a + v, 0)
  if (!total) return <p className="py-10 text-center text-sm text-muted">No listings yet.</p>
  let acc = 0
  const R = 52, C = 2 * Math.PI * R
  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 140 140" className="h-32 w-32 shrink-0 -rotate-90">
        {entries.map(([k, v]) => {
          const len = (v / total) * C
          const el = <circle key={k} cx="70" cy="70" r={R} fill="none" stroke={STATUS_COLORS[k] || '#888'} strokeWidth="18" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-acc} />
          acc += len
          return el
        })}
        <text x="70" y="70" className="rotate-90 fill-current font-display text-[22px] font-bold" textAnchor="middle" dominantBaseline="central" transform="rotate(90 70 70)">{total}</text>
      </svg>
      <ul className="space-y-1.5 text-sm">
        {entries.map(([k, v]) => <li key={k} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLORS[k] }} /><span className="capitalize text-muted">{k}</span><b className="ml-auto pl-3 tabular-nums">{v}</b></li>)}
      </ul>
    </div>
  )
}

export function Overview() {
  const { user, toast } = useApp()
  const [d, setD] = useState(null)
  const [error, setError] = useState(null)
  const [metric, setMetric] = useState('tickets')
  const [range, setRange] = useState(14)
  useEffect(() => { api('/api/admin/overview').then(setD).catch(setError) }, [])
  const series = useMemo(() => (d?.series || []).slice(-range), [d, range])
  if (error) return <ErrorNote error={error} />
  if (!d) return <Loading />
  const sum = (k) => series.reduce((a, x) => a + x[k], 0)
  const todo = [
    [d.pending_listings, 'listings to review', '/admin/listings'],
    [d.to_deliver, 'paid orders to deliver', '/admin/orders?status=paid,preparing,awaiting_delivery'],
    [d.pending_withdrawals, 'withdrawals to pay', '/admin/withdrawals'],
    [d.unmatched_payments, 'payments to reconcile', '/admin/payments'],
  ].filter(([n]) => n > 0)
  const sendReport = async () => { try { const r = await api('/api/admin/reports/daily/send', { method: 'POST' }); toast(r.ok ? 'Report sent to Telegram' : 'Telegram refused the message', r.ok ? 'info' : 'error') } catch (e) { toast(e.message, 'error') } }
  return (
    <div>
      <H title={`Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, ${user.full_name.split(' ')[0]}`} sub="Here's how TicketNest is doing.">
        {user.role === 'admin' && <button className="btn-ghost" onClick={sendReport}><Send className="h-4 w-4" />Send report to Telegram</button>}
      </H>
      {todo.length > 0 && (
        <div className="rise mb-6 flex flex-wrap gap-2">
          {todo.map(([n, l, to]) => <Link key={l} to={to} className="chip !border-warn/40 bg-warn/10 !text-warn"><AlertTriangle className="h-3.5 w-3.5" /><b>{n}</b> {l}</Link>)}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KPI icon={Ticket} label="Tickets sold" value={d.sold_tickets} hint={`${d.available_tickets} on sale now`} to="/admin/listings?status=sold" />
        <KPI icon={DollarSign} label="Total sales" value={usd(d.revenue_cents)} hint={`${d.paid_orders} paid orders`} tone="good" />
        <KPI icon={TrendingUp} label="TicketNest revenue" value={usd(d.platform_revenue_cents)} hint="Buyer fee + seller commission" tone="good" />
        <KPI icon={Package} label="To deliver" value={d.to_deliver} hint={`${d.awaiting_payment} awaiting payment`} tone="warn" to="/admin/orders?status=paid,preparing,awaiting_delivery" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="card rise min-w-0 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[13px] font-medium text-muted">{{ tickets: 'Tickets sold', revenue_cents: 'Total sales', platform_cents: 'TicketNest revenue' }[metric]} · last {range} days</p>
              <p className="mt-1 font-display text-[28px] font-bold leading-none tabular-nums">{metric === 'tickets' ? sum('tickets') : usd2(sum(metric))}</p>
              <p className="mt-1.5 text-[12px] text-muted">{sum('orders')} paid order{sum('orders') === 1 ? '' : 's'} · {metric === 'tickets' ? `${(sum('tickets') / range).toFixed(1)} per day` : `${usd2(Math.round(sum(metric) / range))} per day`}</p>
            </div>
            <Segmented value={range} onChange={setRange} options={[[7, '7D'], [14, '14D'], [30, '30D']]} />
          </div>
          <div className="mt-4"><Segmented value={metric} onChange={setMetric} options={[['tickets', 'Tickets'], ['revenue_cents', 'Sales'], ['platform_cents', 'Revenue']]} /></div>
          <div className="mt-5"><AreaChart key={`${metric}${range}`} data={series} metric={metric} /></div>
        </div>
        <div className="card rise p-5">
          <p className="mb-4 font-semibold">Listings by status</p>
          <Donut counts={d.listing_status || {}} />
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="card rise overflow-hidden">
          <div className="flex items-center justify-between p-5 pb-3"><p className="font-semibold">Recent orders</p><Link to="/admin/orders" className="text-sm font-semibold text-accent">All orders</Link></div>
          {!d.recent_orders.length ? <p className="px-5 pb-5 text-sm text-muted">No orders yet.</p> : (
            <div className="divide-y divide-line">
              {d.recent_orders.map((o) => (
                <Link key={o.id} to={`/admin/orders/${o.id}`} className="flex items-center gap-3 px-5 py-3 transition hover:bg-raised">
                  <div className="min-w-0 flex-1"><p className="font-semibold">{o.order_number}</p><p className="truncate text-[12px] text-muted">{o.item.concert_title} · {o.item.category_name} × {o.item.quantity} · {dateTime(o.created_at)}</p></div>
                  <OrderBadge status={o.status} /><span className="hidden w-20 text-right font-semibold tabular-nums sm:block">{usd2(o.total_cents)}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
        <div className="space-y-6">
          <div className="card rise p-5">
            <p className="mb-3 font-semibold">Best sellers</p>
            {!d.top_concerts?.length ? <p className="text-sm text-muted">No sales yet.</p> : d.top_concerts.map((c, i) => {
              const max = d.top_concerts[0].tickets || 1
              return (
                <div key={c.title} className="py-1.5">
                  <div className="flex justify-between text-sm"><span className="truncate pr-2">{i + 1}. {c.title}</span><b className="tabular-nums">{c.tickets}</b></div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-accent transition-all duration-700" style={{ width: `${(c.tickets / max) * 100}%` }} /></div>
                </div>
              )
            })}
          </div>
          <div className="card rise p-5">
            <p className="font-semibold">Integrations</p>
            <ul className="mt-3 space-y-2 text-sm">
              {[['Telegram bot', d.integrations.telegram_bot], ['Admin alert group', d.integrations.admin_group], [`Admin Telegram IDs (${d.integrations.admin_ids})`, d.integrations.admin_ids > 0],
                ['Payment group', d.integrations.payment_group], [`PayWay listener: ${d.integrations.listener}`, d.integrations.listener === 'connected'],
                [`Email: ${d.integrations.email}`, d.integrations.email !== 'none'], ['Google sign-in', d.integrations.google], [`Storage: ${d.integrations.storage}`, d.integrations.storage === 'r2']]
                .map(([l, ok]) => <li key={l} className="flex items-center gap-2">{ok ? <CheckCircle2 className="h-4 w-4 text-good" /> : <CircleDashed className="h-4 w-4 text-muted" />}<span className={ok ? '' : 'text-muted'}>{l}</span></li>)}
            </ul>
            {d.integrations.listener_error && <p className="mt-3 rounded-lg bg-bad/5 p-2 text-[12px] text-bad">{d.integrations.listener_error}</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
