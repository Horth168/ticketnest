import { AlertTriangle, ArrowUpRight, CheckCircle2, CircleDashed, DollarSign, Package, Send, Ticket, TrendingUp } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ErrorNote, Loading, OrderBadge } from '../../components/ui'
import { useApp } from '../../context/App'
import { api } from '../../lib/api'
import { cls, dateTime, usd, usd2 } from '../../lib/format'
import { H, Tabs } from './AdminApp'

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

function BarChart({ data, metric }) {
  const [hover, setHover] = useState(null)
  const max = Math.max(1, ...data.map((d) => d[metric]))
  const fmt = (v) => (metric === 'tickets' ? `${v} tickets` : usd(v))
  return (
    <div className="relative">
      <div className="flex h-48 items-end gap-[3px] sm:gap-1.5">
        {data.map((d, i) => (
          <div key={d.date} className="group relative flex h-full flex-1 items-end" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => setHover(i)}>
            <div className={cls('bar-grow w-full rounded-t-md transition-colors', d[metric] ? 'bg-accent/70 group-hover:bg-accent' : 'bg-line')}
              style={{ height: `${Math.max(3, (d[metric] / max) * 100)}%`, animationDelay: `${i * 15}ms` }} />
          </div>
        ))}
      </div>
      {hover !== null && (
        <div className="pop pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 rounded-lg bg-ink px-2.5 py-1.5 text-[12px] text-bg shadow-lift">
          {new Date(data[hover].date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}: <b>{fmt(data[hover][metric])}</b>
        </div>
      )}
      <div className="mt-2 flex justify-between text-[11px] text-muted">
        <span>{new Date(data[0].date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
        <span>Today</span>
      </div>
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
        <div className="card rise p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold">{metric === 'tickets' ? 'Tickets sold' : 'Sales'}</p>
              <p className="font-display text-2xl font-bold tabular-nums">{metric === 'tickets' ? sum('tickets') : usd2(sum('revenue_cents'))}<span className="ml-2 text-sm font-normal text-muted">last {range} days</span></p>
            </div>
            <div className="flex min-w-0 max-w-full flex-wrap gap-x-2 [&>div]:mb-0">
              <Tabs value={metric} onChange={setMetric} options={[['tickets', 'Tickets'], ['revenue_cents', 'Sales'], ['platform_cents', 'Revenue']]} />
              <Tabs value={range} onChange={setRange} options={[[7, '7d'], [14, '14d'], [30, '30d']]} />
            </div>
          </div>
          <div className="mt-4"><BarChart key={`${metric}${range}`} data={series} metric={metric} /></div>
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
