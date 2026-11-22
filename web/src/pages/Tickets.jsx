// "My tickets": only the tickets the customer bought, shown as ticket stubs (no profile header).
// Used by the website (/tickets) and the Telegram Mini App (/tg/orders).
import { ArrowRight, CalendarDays, ChevronRight, MapPin, Tag, Ticket } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ErrorNote, Loading, OrderBadge } from '../components/ui'
import { useLink } from '../context/App'
import { useT } from '../i18n'
import { api } from '../lib/api'
import { cls, dateShort, usd2 } from '../lib/format'

const CLOSED = ['cancelled', 'refunded']
const isPast = (o) => CLOSED.includes(o.status) || (o.item.concert_starts_at && new Date(o.item.concert_starts_at) < new Date())

export default function TicketsPage() {
  const { t } = useT()
  return (
    <div className="page max-w-3xl pt-6 sm:pt-10">
      <MyTickets title={t('My tickets')} />
    </div>
  )
}

export function MyTickets({ title }) {
  const { t } = useT()
  const link = useLink()
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('upcoming')
  useEffect(() => { api('/api/orders').then(setRows).catch((e) => { setError(e); setRows([]) }) }, [])

  const groups = useMemo(() => {
    const all = rows || []
    const up = all.filter((o) => !isPast(o)).sort((a, b) => new Date(a.item.concert_starts_at) - new Date(b.item.concert_starts_at))
    return { upcoming: up, past: all.filter(isPast) }
  }, [rows])

  const list = groups[tab]
  return (
    <>
      <div className="rise flex items-end justify-between gap-3">
        <div>
          <p className="eyebrow">{t('Bought on TicketNest')}</p>
          <h1 className="mt-1 text-[28px] font-bold leading-tight sm:text-4xl">{title}</h1>
        </div>
        <Link to={link('/concerts')} className="btn-ghost shrink-0 !px-3 sm:!px-4"><Ticket className="h-4 w-4" /><span className="hidden sm:inline">{t('Find tickets')}</span><span className="sm:hidden">{t('Buy')}</span></Link>
      </div>

      <div className="mt-5 inline-flex rounded-full border border-line bg-surface p-1" role="tablist">
        {[['upcoming', t('Upcoming')], ['past', t('Past')]].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={cls('rounded-full px-4 py-1.5 text-sm font-semibold transition', tab === k ? 'bg-ink text-bg shadow-card' : 'text-muted hover:text-ink')}>
            {l}{rows && <span className={cls('ml-1.5 tabular-nums', tab === k ? 'opacity-70' : 'opacity-60')}>{groups[k].length}</span>}
          </button>
        ))}
      </div>

      <ErrorNote error={error} />
      <div className="mt-5 space-y-4">
        {!rows ? <Loading /> : list.length ? list.map((o, i) => <TicketStub key={o.id} o={o} i={i} />) : <NoTickets past={tab === 'past'} />}
      </div>

      <Link to={link('/account/listings')} className="card mt-8 flex items-center gap-3 p-4 transition hover:bg-raised">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent"><Tag className="h-5 w-5" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{t('Selling tickets?')}</span>
          <span className="block truncate text-[13px] text-muted">{t('Your listings, sales and payouts are in My listings.')}</span>
        </span>
        <ChevronRight className="h-4 w-4 text-muted" />
      </Link>
    </>
  )
}

function TicketStub({ o, i }) {
  const { t } = useT()
  const link = useLink()
  const it = o.item
  const d = it.concert_starts_at ? new Date(it.concert_starts_at) : null
  const dim = CLOSED.includes(o.status)
  const pay = o.status === 'awaiting_payment'
  return (
    <Link to={link(`/orders/${o.order_number}`)} style={{ animationDelay: `${Math.min(i, 6) * 60}ms` }}
      className={cls('rise group relative flex overflow-hidden rounded-3xl border border-line bg-surface shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lift', dim && 'opacity-60')}>
      {/* date stub */}
      <div className={cls('relative flex w-[78px] shrink-0 flex-col items-center justify-center text-white sm:w-24', dim ? 'bg-muted' : 'holo-bg')}>
        {d ? (<>
          <span className="text-[11px] font-bold uppercase tracking-[.14em] opacity-85">{d.toLocaleString('en', { month: 'short' })}</span>
          <span className="font-display text-[34px] font-bold leading-none sm:text-[40px]">{d.getDate()}</span>
          <span className="mt-1 text-[11px] font-semibold opacity-85">{d.toLocaleString('en', { weekday: 'short' })}</span>
        </>) : <Ticket className="h-7 w-7" />}
      </div>
      {/* perforation */}
      <div className="relative w-0 border-l-2 border-dashed border-line">
        <span className="absolute -left-[9px] -top-2 h-4 w-4 rounded-full border border-line bg-bg" />
        <span className="absolute -bottom-2 -left-[9px] h-4 w-4 rounded-full border border-line bg-bg" />
      </div>
      <div className="min-w-0 flex-1 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-[11px] font-bold uppercase tracking-[.14em] text-accent">{it.artist_name}</p>
          <OrderBadge status={o.status} />
        </div>
        <p className="mt-1 line-clamp-2 font-display text-[17px] font-bold leading-snug sm:text-lg">{it.concert_title}</p>
        <div className="mt-2 space-y-1 text-[13px] text-muted">
          {it.venue && <p className="flex items-center gap-1.5 truncate"><MapPin className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{it.venue}</span></p>}
          {d && <p className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 shrink-0" />{dateShort(it.concert_starts_at)} · {d.toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' })}</p>}
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
          <span className="min-w-0 truncate text-[13px]"><b className="font-semibold">{it.category_name}</b> × {it.quantity}{it.seat_info ? <span className="text-muted"> · {it.seat_info}</span> : null}</span>
          {pay
            ? <span className="btn-accent shrink-0 !px-3 !py-1.5 text-[13px]">{t('Pay now')} <ArrowRight className="h-3.5 w-3.5" /></span>
            : <span className="shrink-0 font-semibold tabular-nums">{usd2(o.total_cents)}</span>}
        </div>
        <p className="mt-1.5 text-[11.5px] text-muted">{o.order_number}</p>
      </div>
    </Link>
  )
}

function NoTickets({ past }) {
  const { t } = useT()
  const link = useLink()
  return (
    <div className="card rise flex flex-col items-center px-6 py-12 text-center">
      <span className="holo-bg grid h-14 w-14 place-items-center rounded-2xl text-white shadow-[0_12px_28px_-10px_rgba(214,90,200,.7)]"><Ticket className="h-7 w-7" /></span>
      <p className="mt-4 font-display text-lg font-bold">{past ? t('No past tickets') : t('No upcoming tickets')}</p>
      <p className="mt-1 max-w-xs text-sm text-muted">{t('Tickets you buy will show up here with their delivery status.')}</p>
      {!past && <Link to={link('/concerts')} className="btn-holo mt-5">{t('Find tickets')} <ArrowRight className="h-4 w-4" /></Link>}
    </div>
  )
}
