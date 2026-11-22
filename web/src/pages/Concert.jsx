import { CalendarDays, Clock, Info, MapPin, MessageCircle, Minus, Plus, ShieldCheck, Ticket } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArtistImage, ConcertCard, isLogo } from '../components/cards'
import { Reveal } from '../components/Motion'
import { useT } from '../i18n'
import { Badge, Empty, Loading, Poster } from '../components/ui'
import { useApp, useLink } from '../context/App'
import { api } from '../lib/api'
import { cls, dateLong, pct, time, TICKET_TYPES, usd } from '../lib/format'

export default function Concert() {
  const { slug } = useParams()
  const [c, setC] = useState(null)
  const [error, setError] = useState(null)
  const [cat, setCat] = useState(null)
  const link = useLink()
  const { t } = useT()
  useEffect(() => { setC(null); api(`/api/concerts/${slug}`).then(setC).catch(setError) }, [slug])
  if (error) return <div className="page pt-10"><Empty icon={Ticket} title={t('Concert not found')}>{t('It may have been removed or the link is wrong.')}</Empty></div>
  if (!c) return <Loading />
  const listings = c.listings.filter((l) => !cat || l.category_id === cat)
  return (
    <div>
      <div className="relative overflow-hidden border-b border-line bg-surface">
        <div className="page grid gap-8 py-8 md:grid-cols-[minmax(0,420px)_1fr] md:py-12">
          <div className="aspect-[4/3] overflow-hidden rounded-3xl border border-line shadow-lift"><Poster src={c.poster_url} title={c.title} artist={c.artist.name} /></div>
          <div className="flex flex-col justify-center">
            <Link to={link(`/artists/${c.artist.slug}`)} className="eyebrow hover:text-accent">{c.artist.name}</Link>
            <h1 className="mt-2 text-[34px] font-bold leading-tight sm:text-[44px]">{c.title}</h1>
            <div className="mt-5 grid gap-3 text-[15px] sm:grid-cols-2">
              <p className="flex items-center gap-2.5"><CalendarDays className="h-5 w-5 text-muted" />{dateLong(c.starts_at)}</p>
              <p className="flex items-center gap-2.5"><Clock className="h-5 w-5 text-muted" />{time(c.starts_at)}{c.doors_open && ` · ${t('doors')} ${c.doors_open}`}</p>
              <p className="flex items-center gap-2.5 sm:col-span-2"><MapPin className="h-5 w-5 text-muted" />{c.venue}, {c.city}, {c.country}</p>
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              {c.status === 'postponed' && <Badge tone="warn">{t('Postponed — date to be confirmed')}</Badge>}
              {!c.on_sale && <Badge>{t('Sales closed')}</Badge>}
              {c.sold_out && <Badge tone="bad">{t('SOLD OUT')}</Badge>}
              {c.on_sale && !c.sold_out && <Badge tone="good">{t('{n} tickets available', { n: c.tickets_available })}</Badge>}
            </div>
          </div>
        </div>
      </div>

      <div className="page mt-10 grid gap-10 lg:grid-cols-[1fr_340px]">
        <div>
          <h2 className="text-2xl font-bold">{t('Tickets')}</h2>
          {c.categories.length > 0 && (
            <div className="no-scrollbar -mx-4 mt-4 flex gap-2 overflow-x-auto px-4">
              <button onClick={() => setCat(null)} className={cls('chip', !cat && '!border-ink bg-ink !text-bg')}>{t('All')}</button>
              {c.categories.map((k) => (
                <button key={k.id} onClick={() => setCat(k.id)} className={cls('chip', cat === k.id && '!border-ink bg-ink !text-bg')}>
                  {k.name}<span className={cat === k.id ? 'text-bg/70' : 'text-muted'}>{k.available ? `${t('from')} ${usd(k.from_price_cents)}` : t('Sold out')}</span>
                </button>
              ))}
            </div>
          )}
          <div className="mt-5 space-y-3">
            {listings.length ? listings.map((l, i) => <Reveal key={l.id} delay={i * 60}><ListingRow l={l} /></Reveal>)
              : <Empty icon={Ticket} title={c.on_sale ? t('SOLD OUT') : t('Sales closed')}>
                  {c.on_sale ? t('No tickets are available in this category right now. New listings appear here as soon as they are approved.') : t('This concert is no longer on sale.')}
                </Empty>}
          </div>
          {c.description && <><h2 className="mt-12 text-2xl font-bold">{t('About this concert')}</h2><p className="mt-3 whitespace-pre-line leading-relaxed text-muted">{c.description}</p></>}
        </div>
        <aside className="space-y-4">
          <DeliveryInfo c={c} />
          <div className="card p-5">
            <p className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-5 w-5 text-good" />{t('Reviewed listings')}</p>
            <p className="mt-2 text-sm leading-relaxed text-muted">{t("Our team checks each seller's ticket proof and purchase receipt before the listing goes on sale. TicketNest is an independent resale marketplace.")} <Link className="text-accent hover:underline" to={link('/policies/authenticity')}>{t('Authenticity policy')}</Link></p>
          </div>
        </aside>
      </div>
    </div>
  )
}

function DeliveryInfo({ c }) {
  const { settings } = useApp()
  const { t } = useT()
  const tg = settings?.telegram?.delivery_username
  return (
    <div className="card p-5">
      <p className="flex items-center gap-2 font-semibold"><MessageCircle className="h-5 w-5 text-accent" />{t('Ticket delivery')}</p>
      <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted">
        {c.delivery_info || t('After your payment is verified, our team contacts you on Telegram and sends your ticket manually. Make sure your Telegram username is correct at checkout.')}
      </p>
      {tg && <a href={`https://t.me/${tg}`} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm font-semibold text-accent hover:underline">@{tg}</a>}
    </div>
  )
}

export function ListingRow({ l }) {
  const nav = useNavigate()
  const link = useLink()
  const { settings } = useApp()
  const { t } = useT()
  const [qty, setQty] = useState(1)
  const reserved = l.status === 'reserved' || l.available === 0
  const max = Math.min(10, l.available)
  return (
    <div className={cls('card card-hover flex flex-col gap-4 p-4 sm:flex-row sm:items-center', reserved && 'opacity-70')}>
      <div className="flex min-w-0 flex-1 items-start gap-4">
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-accent/10 text-center font-display text-[13px] font-bold leading-tight text-accent">{l.category}</div>
        <div className="min-w-0">
          <p className="font-semibold">{l.category}{l.seat_info && <span className="font-normal text-muted"> · {l.seat_info}</span>}</p>
          <p className="mt-0.5 text-[13px] text-muted">{t(TICKET_TYPES[l.ticket_type])} · {t(l.seller_label)}</p>
          {l.notes && <p className="mt-1 line-clamp-2 text-[13px] text-muted">{l.notes}</p>}
          <p className="mt-1 text-[12px] text-muted">{t('Seller price {price} + {pct} fee', { price: usd(l.price_cents), pct: pct(settings?.fees?.buyer_markup_bps ?? 1500) })}</p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-4 sm:justify-end">
        <div className="text-right">
          <p className="font-display text-xl font-bold tabular-nums">{usd(l.buyer_price_cents)}</p>
          <p className="text-[12px] text-muted">{reserved ? t('On hold — check back soon') : t('per ticket · {n} left', { n: l.available })}</p>
        </div>
        {!reserved && (
          <div className="flex items-center gap-2">
            {max > 1 && (
              <div className="flex items-center rounded-xl border border-line">
                <button className="grid h-10 w-9 place-items-center text-muted disabled:opacity-30" disabled={qty <= 1} onClick={() => setQty(qty - 1)} aria-label={t('Fewer')}><Minus className="h-4 w-4" /></button>
                <span className="w-6 text-center text-sm font-semibold tabular-nums">{qty}</span>
                <button className="grid h-10 w-9 place-items-center text-muted disabled:opacity-30" disabled={qty >= max} onClick={() => setQty(qty + 1)} aria-label={t('More')}><Plus className="h-4 w-4" /></button>
              </div>
            )}
            <button className="btn-accent h-10" onClick={() => nav(link(`/checkout/${l.id}?qty=${qty}`))}>{t('Buy')}</button>
          </div>
        )}
      </div>
    </div>
  )
}

export function Artist() {
  const { slug } = useParams()
  const { t } = useT()
  const [a, setA] = useState(null)
  useEffect(() => { api(`/api/artists/${slug}`).then(setA).catch(() => setA(false)) }, [slug])
  if (a === false) return <div className="page pt-10"><Empty title={t('Artist not found')} /></div>
  if (!a) return <Loading />
  return (
    <div className="page pt-10">
      <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
        <div className={cls('pop grid h-28 w-28 place-items-center overflow-hidden rounded-full border border-line shadow-card', isLogo(a.image_url) ? 'bg-white' : 'bg-raised')}>
          <ArtistImage a={a} />
        </div>
        <div>
          <p className="eyebrow">{a.genre}{a.agency && ` · ${a.agency}`}</p>
          <h1 className="mt-1 text-4xl font-bold">{a.name}</h1>
          {a.bio && <p className="mt-2 max-w-2xl text-muted">{a.bio}</p>}
        </div>
      </div>
      <h2 className="mt-12 text-2xl font-bold">{t('Upcoming concerts')}</h2>
      <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {a.concerts.length ? a.concerts.map((c) => <ConcertCard key={c.id} c={c} />)
          : <div className="sm:col-span-2 lg:col-span-3"><Empty icon={Info} title={t('No upcoming dates')}>{t("We'll list {name} concerts here as soon as they're announced and added.", { name: a.name })}</Empty></div>}
      </div>
    </div>
  )
}
