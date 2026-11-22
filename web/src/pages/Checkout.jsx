import { ArrowLeft, Check, Clock, Copy, Download, ExternalLink, FileText, MessageCircle, ShieldCheck, Smartphone, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import KhqrCard from '../components/KhqrCard'
import { Countdown, Empty, ErrorNote, Field, Loading, OrderBadge, Row, Spinner } from '../components/ui'
import { useApp, useBase, useLink } from '../context/App'
import { api, apiUrl, openFile } from '../lib/api'
import { dateLong, dateTime, khr, newKey, pct, time, usd2 } from '../lib/format'
import { haptic, inTelegram, openExternal, saveImage } from '../lib/telegram'
import { useMainButton } from '../tg/hooks'
import { useT } from '../i18n'

export function RequireAuth({ children }) {
  const { user, ready } = useApp()
  const loc = useLocation()
  const base = useBase()
  if (!ready) return <Loading />
  if (!user) return <Navigate to={`${base}/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />
  return children
}

export function PriceBreakdown({ q }) {
  const { t } = useT()
  return (
    <div>
      <Row k={`${t('Ticket price')} × ${q.quantity}`} v={usd2(q.subtotal_cents)} />
      <Row k={`${t('Marketplace fee')} (${pct(q.markup_bps)})`} v={usd2(q.markup_cents)} />
      <Row k={t('Total')} v={usd2(q.total_cents)} strong />
      {q.khr_rate && <p className="text-right text-[12px] text-muted">≈ {khr(q.total_cents, q.khr_rate)}</p>}
    </div>
  )
}

export default function Checkout() {
  const { listingId } = useParams()
  const [sp] = useSearchParams()
  const { user, toast } = useApp()
  const { t } = useT()
  const nav = useNavigate()
  const link = useLink()
  const [q, setQ] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const key = useRef(newKey())
  const [f, setF] = useState({ name: user?.full_name || '', email: user?.email || '', phone: user?.phone || '',
    telegram: user?.telegram_username || '', terms: false })
  const qty = Math.max(1, Math.min(10, Number(sp.get('qty')) || 1))

  useEffect(() => { api(`/api/listings/${listingId}/quote?quantity=${qty}`).then(setQ).catch(setError) }, [listingId, qty])

  const valid = f.name.trim().length >= 2 && f.telegram.trim().length >= 4 && f.terms && q && q.available >= qty
  const submit = useCallback(async () => {
    if (!valid || busy) return
    setBusy(true); setError(null)
    try {
      const o = await api('/api/orders', { method: 'POST', body: {
        listing_id: Number(listingId), quantity: qty, contact_name: f.name, contact_email: f.email || null,
        contact_phone: f.phone, contact_telegram: f.telegram, idempotency_key: key.current,
        channel: inTelegram() ? 'miniapp' : 'web', accept_terms: f.terms } })
      haptic('success')
      nav(link(`/orders/${o.order_number}`), { replace: true })
    } catch (e) { haptic('error'); setError(e); toast(e.message, 'error'); key.current = newKey() } finally { setBusy(false) }
  }, [valid, busy, listingId, qty, f, nav, link, toast])

  useMainButton(q ? t('Pay {amount} with KHQR', { amount: usd2(q.total_cents) }) : null, submit, { enabled: valid, loading: busy })

  if (error && !q) return <div className="page pt-10"><Empty title={t('Tickets unavailable')}>{error.message}</Empty></div>
  if (!q) return <Loading />
  const c = q.listing.concert
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  return (
    <div className="page max-w-5xl pt-8">
      <Link to={link(`/concerts/${c.slug}`)} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" />{t('Back to tickets')}</Link>
      <h1 className="rise mt-3 text-3xl font-bold">{t('Checkout')}</h1>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
        <form className="card space-y-4 p-5 sm:p-6" onSubmit={(e) => { e.preventDefault(); submit() }}>
          <div>
            <p className="font-semibold">{t('Your contact details')}</p>
            <p className="mt-1 text-sm text-muted">{t('Tickets are delivered manually through Telegram, so your Telegram username must be correct.')}</p>
          </div>
          <Field label={t('Full name')}><input className="input" value={f.name} onChange={set('name')} autoComplete="name" required /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('Telegram username')} hint={t("e.g. @yourname — we'll message you here")}>
              <input className="input" value={f.telegram} onChange={set('telegram')} placeholder="@username" required />
            </Field>
            <Field label={t('Phone (optional)')}><input className="input" value={f.phone} onChange={set('phone')} inputMode="tel" autoComplete="tel" /></Field>
          </div>
          <Field label={t('Email for your receipt and invoice')}><input className="input" type="email" value={f.email} onChange={set('email')} autoComplete="email" /></Field>
          <label className="flex cursor-pointer gap-3 rounded-xl bg-raised p-3.5 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[rgb(var(--accent))]" checked={f.terms} onChange={set('terms')} />
            <span className="text-muted">{t('I agree to the terms and refund policy, and understand this is a resale ticket delivered via Telegram after my payment is verified.')} <Link className="text-accent hover:underline" to="/policies/terms" target="_blank">{t('Terms')}</Link> · <Link className="text-accent hover:underline" to="/policies/refunds" target="_blank">{t('Refund policy')}</Link></span>
          </label>
          <ErrorNote error={error} />
          {!inTelegram() && (
            <button type="submit" className="btn-accent w-full py-3.5 text-[15px]" disabled={!valid || busy}>
              {busy ? <Spinner className="h-4 w-4" /> : null}{t('Pay {amount} with KHQR', { amount: usd2(q.total_cents) })}
            </button>
          )}
          <p className="flex items-center justify-center gap-1.5 text-[12px] text-muted"><Clock className="h-3.5 w-3.5" />{t('Your tickets are held for you while you pay.')}</p>
        </form>

        <aside className="card h-fit p-5 sm:p-6">
          <p className="eyebrow">{c.artist.name}</p>
          <p className="mt-1 text-lg font-semibold leading-snug">{c.title}</p>
          <p className="mt-1 text-sm text-muted">{dateLong(c.starts_at)} · {time(c.starts_at)}</p>
          <p className="text-sm text-muted">{c.venue}, {c.city}</p>
          <div className="my-4 rounded-xl bg-raised p-3 text-sm">
            <b>{q.listing.category}</b> × {q.quantity}{q.listing.seat_info && <span className="text-muted"> · {q.listing.seat_info}</span>}
          </div>
          <PriceBreakdown q={q} />
          <p className="mt-4 flex gap-2 text-[12px] leading-relaxed text-muted"><ShieldCheck className="h-4 w-4 shrink-0 text-good" />{t('Your order is confirmed only after your bank payment is verified. No invoice is issued before that.')}</p>
        </aside>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ order / payment page
export function OrderPage() {
  const { number } = useParams()
  const { settings, toast } = useApp()
  const { t } = useT()
  const link = useLink()
  const [o, setO] = useState(null)
  const [error, setError] = useState(null)
  const load = useCallback(() => api(`/api/orders/${number}`).then(setO).catch(setError), [number])
  useEffect(() => { load() }, [load])

  // poll while waiting for the bank
  useEffect(() => {
    if (o?.status !== 'awaiting_payment') return
    const t = setInterval(async () => {
      try {
        const s = await api(`/api/orders/${number}/status`)
        if (s.status !== 'awaiting_payment') { haptic('success'); load() }
      } catch { /* keep polling */ }
    }, 4000)
    return () => clearInterval(t)
  }, [o?.status, number, load])

  if (error) return <div className="page pt-10"><Empty title={t('Order not found')}>{error.message}</Empty></div>
  if (!o) return <Loading />
  const tgUser = o.delivery_contact || settings?.telegram?.delivery_username
  return (
    <div className="page max-w-5xl pt-8">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-bold">{t('Order')} {o.order_number}</h1>
        <OrderBadge status={o.status} />
      </div>
      <p className="mt-1 text-sm text-muted">{t('Placed')} {dateTime(o.created_at)}</p>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          {o.status === 'awaiting_payment' && o.khqr && <PayPanel o={o} onChange={load} toast={toast} />}
          {['paid', 'preparing', 'awaiting_delivery'].includes(o.status) && (
            <div className="pop card border-good/30 p-6">
              <div className="flex items-center gap-3"><span className="pop grid h-12 w-12 place-items-center rounded-full bg-good text-white shadow-[0_10px_30px_-8px_rgb(var(--good)/.7)]"><Check className="h-6 w-6" /></span>
                <p className="text-lg font-semibold">{t('Payment confirmed')}</p></div>
              <p className="mt-3 leading-relaxed text-muted">{t('Your payment has been confirmed. Our team will contact you through Telegram to deliver your ticket.')}</p>
              <p className="mt-2 text-sm text-muted">{t("We'll message @{user}. Tickets are sent by a person, not automatically, usually within 24 hours.", { user: o.contact.telegram })}</p>
              {tgUser && <button onClick={() => openExternal(`https://t.me/${tgUser}`)} className="btn-accent mt-4"><MessageCircle className="h-4 w-4" />{t('Message @{user} on Telegram', { user: tgUser })}</button>}
            </div>
          )}
          {['delivered', 'completed'].includes(o.status) && (
            <div className="card p-6">
              <p className="text-lg font-semibold">🎫 {t('Ticket delivered')}</p>
              <p className="mt-2 text-muted">{t('Delivered {date} via {method}. Check your Telegram messages. Enjoy the show!', { date: dateTime(o.delivery?.delivered_at), method: o.delivery?.method })}</p>
              {o.delivery?.has_file && <button className="btn-ghost mt-4" onClick={() => openFile(`/api/orders/${o.order_number}/delivery-file`, 'ticket', true)}><Download className="h-4 w-4" />{t('Download attached file')}</button>}
            </div>
          )}
          {['cancelled', 'refunded'].includes(o.status) && (
            <div className="card p-6">
              <p className="text-lg font-semibold">{o.status === 'refunded' ? t('Order refunded') : t('Order cancelled')}</p>
              <p className="mt-2 text-muted">{o.cancel_reason || t('This order is closed.')}</p>
              <Link to={link(`/concerts`)} className="btn-ghost mt-4">{t('Browse concerts')}</Link>
            </div>
          )}
          <Timeline o={o} />
        </div>
        <aside className="card h-fit p-5 sm:p-6">
          <p className="eyebrow">{o.item.artist_name}</p>
          <p className="mt-1 text-lg font-semibold">{o.item.concert_title}</p>
          <p className="mt-1 text-sm text-muted">{dateLong(o.item.concert_starts_at)} · {time(o.item.concert_starts_at)}</p>
          <p className="text-sm text-muted">{o.item.venue}</p>
          <div className="my-4 rounded-xl bg-raised p-3 text-sm"><b>{o.item.category_name}</b> × {o.item.quantity}{o.item.seat_info && <span className="text-muted"> · {o.item.seat_info}</span>}</div>
          <PriceBreakdown q={{ quantity: o.item.quantity, subtotal_cents: o.subtotal_cents, markup_cents: o.markup_cents, total_cents: o.total_cents, markup_bps: o.markup_bps, khr_rate: o.khr_rate }} />
          {o.invoice_number && (
            <div className="mt-5 flex gap-2">
              <button className="btn-ghost flex-1" onClick={() => openFile(`/api/orders/${o.order_number}/invoice.pdf`, `${o.invoice_number}.pdf`)}><FileText className="h-4 w-4" />{t('Invoice')}</button>
              <button className="btn-ghost" aria-label={t('Download invoice')} onClick={() => openFile(`/api/orders/${o.order_number}/invoice.pdf?download=1`, `${o.invoice_number}.pdf`, true)}><Download className="h-4 w-4" /></button>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

function PayPanel({ o, onChange, toast }) {
  const { t } = useT()
  const [expired, setExpired] = useState(o.seconds_left <= 0)
  const [cancelling, setCancelling] = useState(false)
  const k = o.khqr
  const amount = k.currency === 'KHR' ? `${k.amount.toLocaleString()} KHR` : `${(k.amount / 100).toFixed(2)}`
  const cancel = async () => {
    if (!confirm(t('Cancel this order and release the tickets?'))) return
    setCancelling(true)
    try { await api(`/api/orders/${o.order_number}/cancel`, { method: 'POST' }); onChange() } catch (e) { toast(e.message, 'error') } finally { setCancelling(false) }
  }
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line bg-raised px-5 py-3.5 text-sm">
        <span className="font-semibold">{t('Scan to pay with KHQR')}</span>
        <span className={`flex items-center gap-1.5 font-semibold ${expired ? 'text-bad' : 'text-warn'}`}><Clock className="h-4 w-4" />{expired ? t('QR expired') : <Countdown seconds={o.seconds_left} onDone={() => setExpired(true)} />}</span>
      </div>
      <div className="grid gap-6 p-5 sm:grid-cols-[280px_1fr] sm:p-6">
        <KhqrCard value={k.payload} amount={k.amount} currency={k.currency} name="TicketNest" dim={expired} />
        <div className="space-y-4 text-sm">
          <ol className="space-y-2.5 text-muted">
            <li><b className="text-ink">1.</b> {t('Open ABA, ACLEDA, Wing or any Bakong banking app and choose Scan QR.')}</li>
            <li><b className="text-ink">2.</b> {t("Pay exactly {amount}. Don't change the amount.", { amount: k.currency === 'USD' ? usd2(k.amount) : amount })}</li>
            <li><b className="text-ink">3.</b> {t('Keep this page open — it updates by itself once the bank confirms.')}</li>
          </ol>
          <div className="rounded-xl border border-line p-3.5">
            <p className="flex items-center gap-2 font-semibold"><Smartphone className="h-4 w-4" />{t('Paying on this phone?')}</p>
            <p className="mt-1 text-muted">{t('Save the QR image, then in your banking app choose Scan → upload from gallery. Or open this page on another device.')}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn-ghost" onClick={() => saveImage(apiUrl(k.image_url), `TicketNest-${o.order_number}.png`)}><Download className="h-4 w-4" />{t('Save QR image')}</button>
              <a className="btn-ghost" href={apiUrl(k.image_url)} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" />{t('Open QR')}</a>
              <button className="btn-ghost" onClick={() => { navigator.clipboard?.writeText(amount); toast(t('Amount copied')) }}><Copy className="h-4 w-4" />{t('Copy amount')}</button>
            </div>
          </div>
          <p className="flex items-center gap-2 text-muted"><Spinner className="h-4 w-4" />{t('Waiting for payment confirmation…')}</p>
          <button onClick={cancel} disabled={cancelling} className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-bad"><X className="h-3.5 w-3.5" />{t('Cancel order')}</button>
          {expired && <p className="rounded-xl bg-bad/5 p-3 text-bad">{t("This QR has expired. If you already paid, don't pay again — wait a few minutes or contact support with your bank receipt. Otherwise, start a new checkout.")}</p>}
        </div>
      </div>
    </div>
  )
}

const LABEL = { created: 'Order placed', paid: 'Payment verified', preparing: 'Preparing ticket', awaiting_delivery: 'Awaiting delivery',
  delivered: 'Ticket delivered', completed: 'Completed', cancelled: 'Cancelled', refunded: 'Refunded' }
function Timeline({ o }) {
  const { t } = useT()
  return (
    <div className="card p-5 sm:p-6">
      <p className="font-semibold">{t('Order history')}</p>
      <ol className="mt-4 space-y-4 border-l border-line pl-5">
        {o.events.map((e, i) => (
          <li key={i} className="relative">
            <span className="absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full bg-accent ring-4 ring-surface" />
            <p className="text-sm font-semibold">{t(LABEL[e.status] || e.status)}</p>
            <p className="text-[12px] text-muted">{dateTime(e.at)}</p>
          </li>
        ))}
      </ol>
    </div>
  )
}
