import { AlertTriangle, CheckCircle2, CircleDashed } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ErrorNote, Loading, OrderBadge, Stat } from '../../components/ui'
import { api } from '../../lib/api'
import { dateTime, usd, usd2 } from '../../lib/format'
import { H } from './AdminApp'

export function Overview() {
  const [d, setD] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => { api('/api/admin/overview').then(setD).catch(setError) }, [])
  if (error) return <ErrorNote error={error} />
  if (!d) return <Loading />
  const max = Math.max(1, ...d.daily.map((x) => x.revenue_cents))
  const todo = [
    [d.pending_listings, 'listings to review', '/admin/listings'],
    [d.to_deliver, 'paid orders to deliver', '/admin/orders?status=paid,preparing,awaiting_delivery'],
    [d.pending_withdrawals, 'withdrawals to pay', '/admin/withdrawals'],
    [d.unmatched_payments, 'payments to reconcile', '/admin/payments'],
  ].filter(([n]) => n > 0)
  return (
    <div>
      <H title="Overview" sub="Paid orders only count once the payment is verified." />
      {todo.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {todo.map(([n, l, to]) => <Link key={l} to={to} className="chip !border-warn/40 bg-warn/10 !text-warn"><AlertTriangle className="h-3.5 w-3.5" /><b>{n}</b> {l}</Link>)}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total sales (paid)" value={usd(d.revenue_cents)} hint={`${d.paid_orders} paid orders`} />
        <Stat label="Platform revenue" value={usd(d.platform_revenue_cents)} hint="Buyer fee + seller commission" />
        <Stat label="Total orders" value={d.total_orders} hint={`${d.awaiting_payment} awaiting payment`} />
        <Stat label="Listings" value={d.total_listings} hint={`${d.pending_listings} pending`} />
        <Stat label="Tickets available" value={d.available_tickets} />
        <Stat label="Tickets sold" value={d.sold_tickets} />
        <Stat label="Pending withdrawals" value={d.pending_withdrawals} />
        <Stat label="Payments" value={d.payments.verified || 0} hint={`verified · ${d.payments.expired || 0} expired · ${d.payments.pending || 0} pending`} />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="card p-5">
          <p className="font-semibold">Sales, last 30 days</p>
          {d.daily.length ? (
            <div className="mt-5 flex h-40 items-end gap-1">
              {d.daily.map((x) => (
                <div key={x.date} className="group relative max-w-[36px] flex-1">
                  <div className="rounded-t bg-accent/80 transition group-hover:bg-accent" style={{ height: `${Math.max(4, (x.revenue_cents / max) * 150)}px` }} />
                  <span className="pointer-events-none absolute -top-8 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-ink px-2 py-1 text-[11px] text-bg group-hover:block">{x.date}: {usd(x.revenue_cents)}</span>
                </div>
              ))}
            </div>
          ) : <p className="mt-4 text-sm text-muted">No paid orders in the last 30 days.</p>}
        </div>
        <div className="card p-5">
          <p className="font-semibold">Integrations</p>
          <ul className="mt-3 space-y-2 text-sm">
            {[['Telegram bot', d.integrations.telegram_bot], ['Admin alert group', d.integrations.admin_group], [`Admin Telegram IDs (${d.integrations.admin_ids})`, d.integrations.admin_ids > 0],
              ['Payment group', d.integrations.payment_group], [`PayWay listener: ${d.integrations.listener}`, d.integrations.listener === 'connected'],
              ['Bakong API check (optional)', d.integrations.bakong_api], [`Email: ${d.integrations.email}`, d.integrations.email !== 'none'], ['Google sign-in', d.integrations.google]]
              .map(([l, ok]) => <li key={l} className="flex items-center gap-2">{ok ? <CheckCircle2 className="h-4 w-4 text-good" /> : <CircleDashed className="h-4 w-4 text-muted" />}<span className={ok ? '' : 'text-muted'}>{l}</span></li>)}
          </ul>
          {d.integrations.listener_error && <p className="mt-3 rounded-lg bg-bad/5 p-2 text-[12px] text-bad">{d.integrations.listener_error}</p>}
        </div>
      </div>
      <div className="card mt-6 overflow-hidden">
        <p className="p-5 pb-3 font-semibold">Recent orders</p>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-line">
            {d.recent_orders.map((o) => (
              <tr key={o.id} className="hover:bg-raised">
                <td className="px-5 py-3"><Link to={`/admin/orders/${o.id}`} className="font-semibold hover:text-accent">{o.order_number}</Link><p className="text-[12px] text-muted">{dateTime(o.created_at)}</p></td>
                <td className="hidden px-3 py-3 md:table-cell">{o.item.concert_title}<p className="text-[12px] text-muted">{o.item.category_name} × {o.item.quantity}</p></td>
                <td className="px-3 py-3"><OrderBadge status={o.status} /></td>
                <td className="px-5 py-3 text-right font-semibold tabular-nums">{usd2(o.total_cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!d.recent_orders.length && <p className="px-5 pb-5 text-sm text-muted">No orders yet.</p>}
      </div>
    </div>
  )
}
