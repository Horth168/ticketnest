import { ArrowRight, BadgeCheck, CreditCard, MessageCircle, ShieldCheck, Ticket, Upload } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArtistTile, ConcertCard, SkeletonCards } from '../components/cards'
import { SearchBox, StageArt } from '../components/Layout'
import { Empty, ErrorNote } from '../components/ui'
import { useApp } from '../context/App'
import { api } from '../lib/api'
import { dateShort, usd } from '../lib/format'

export function useHome() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => { api('/api/home').then(setData).catch(setError) }, [])
  return { data, error }
}

export default function Home() {
  const { data, error } = useHome()
  const { settings } = useApp()
  const markup = settings?.fees?.buyer_markup_bps
  return (
    <>
      <section className="relative overflow-hidden bg-[#0E0B1F] text-white">
        <StageArt className="absolute inset-0 h-full w-full" />
        <div className="page relative flex min-h-[520px] flex-col justify-center py-20">
          <p className="rise eyebrow !text-white/60">K-pop concert ticket resale · Cambodia</p>
          <h1 className="rise mt-4 max-w-3xl text-[42px] font-bold leading-[1.02] sm:text-[64px]" style={{ animationDelay: '60ms' }}>
            Your seat at the show, <span className="text-[#A897FF]">from fans who can't go.</span>
          </h1>
          <p className="rise mt-5 max-w-xl text-[17px] leading-relaxed text-white/70" style={{ animationDelay: '120ms' }}>
            Every listing is checked by our team before it goes live. Pay securely with KHQR and get your ticket through Telegram.
          </p>
          <div className="rise mt-8 max-w-xl text-ink" style={{ animationDelay: '180ms' }}><SearchBox big /></div>
          <div className="rise mt-6 flex flex-wrap gap-2" style={{ animationDelay: '240ms' }}>
            {(data?.artists || []).slice(0, 6).map((a) => (
              <Link key={a.id} to={`/artists/${a.slug}`} className="rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-[13px] font-medium text-white/85 backdrop-blur hover:bg-white/10">{a.name}</Link>
            ))}
          </div>
        </div>
      </section>

      <div className="page">
        <ErrorNote error={error} />
        <Section title="Featured concerts" to="/concerts" className="mt-14">
          {!data ? <Grid><SkeletonCards n={3} /></Grid>
            : data.featured.length ? <Grid>{data.featured.map((c) => <ConcertCard key={c.id} c={c} />)}</Grid>
            : <Empty icon={Ticket} title="No concerts yet">New concerts appear here as soon as our team adds them.</Empty>}
        </Section>

        {data?.artists?.length > 0 && (
          <Section title="Popular artists" to="/artists">
            <div className="no-scrollbar -mx-4 flex gap-4 overflow-x-auto px-4 pb-2">{data.artists.map((a) => <ArtistTile key={a.id} a={a} />)}</div>
          </Section>
        )}

        {data?.upcoming?.length > 3 && (
          <Section title="Upcoming events" to="/concerts">
            <Grid four>{data.upcoming.slice(0, 8).map((c) => <ConcertCard key={c.id} c={c} />)}</Grid>
          </Section>
        )}

        {data?.recent_listings?.length > 0 && (
          <Section title="Recently listed tickets" to="/concerts?available=1">
            <div className="card divide-y divide-line">
              {data.recent_listings.map((l) => (
                <Link key={l.id} to={`/concerts/${l.concert.slug}`} className="flex items-center gap-4 p-4 transition hover:bg-raised">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-accent/10 font-display text-sm font-bold text-accent">{l.category.slice(0, 4)}</div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{l.concert.title}</p>
                    <p className="truncate text-[13px] text-muted">{l.concert.artist.name} · {l.concert.city} · {dateShort(l.concert.starts_at)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold tabular-nums">{usd(l.buyer_price_cents)}</p>
                    <p className="text-[12px] text-muted">{l.available} left</p>
                  </div>
                </Link>
              ))}
            </div>
          </Section>
        )}

        {data?.categories?.length > 0 && (
          <Section title="Ticket categories on sale">
            <div className="flex flex-wrap gap-2">
              {data.categories.map((c) => <Link key={c.name} to={`/concerts?category=${encodeURIComponent(c.name)}`} className="chip">{c.name}<span className="text-muted">{c.listings}</span></Link>)}
            </div>
          </Section>
        )}

        <HowItWorksStrip markup={markup} />

        <section className="mt-20 grid gap-6 overflow-hidden rounded-3xl bg-ink p-8 text-bg sm:p-12 md:grid-cols-[1.4fr_1fr] md:items-center">
          <div>
            <p className="eyebrow !text-bg/60">Can't make the show?</p>
            <h2 className="mt-3 text-3xl font-bold sm:text-4xl">Sell your tickets to real fans.</h2>
            <p className="mt-3 max-w-lg text-bg/70">List in a few minutes. Our team reviews your ticket proof, handles the payment and delivery, and pays your earnings to your bank.</p>
          </div>
          <div className="md:text-right"><Link to="/sell" className="btn bg-bg px-6 py-3.5 text-ink hover:opacity-90">Start selling <ArrowRight className="h-4 w-4" /></Link></div>
        </section>

        <TrustBlock />
      </div>
    </>
  )
}

function Section({ title, to, children, className = 'mt-16' }) {
  return (
    <section className={className}>
      <div className="mb-5 flex items-end justify-between gap-4">
        <h2 className="text-[26px] font-bold">{title}</h2>
        {to && <Link to={to} className="flex items-center gap-1 text-sm font-semibold text-accent hover:underline">See all <ArrowRight className="h-4 w-4" /></Link>}
      </div>
      {children}
    </section>
  )
}
const Grid = ({ children, four }) => <div className={`grid gap-5 sm:grid-cols-2 ${four ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>{children}</div>

export function HowItWorksStrip({ markup }) {
  const steps = [
    [Upload, 'Sellers list', 'Fans submit their tickets with proof. Nothing goes live until our team approves it.'],
    [CreditCard, 'You pay by KHQR', `Scan with ABA or any Bakong banking app. The price you see includes our ${markup != null ? (markup / 100) + '% ' : ''}marketplace fee.`],
    [BadgeCheck, 'Payment is verified', 'Your order is confirmed only after the bank payment is matched. You get an email and invoice.'],
    [MessageCircle, 'Ticket via Telegram', 'Our team contacts you on Telegram and sends your ticket. Your order shows when it is delivered.'],
  ]
  return (
    <section className="mt-20">
      <h2 className="text-[26px] font-bold">How TicketNest works</h2>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map(([Icon, t, d], i) => (
          <div key={t} className="card p-5">
            <div className="flex items-center justify-between"><Icon className="h-6 w-6 text-accent" /><span className="font-display text-sm font-bold text-muted">0{i + 1}</span></div>
            <p className="mt-4 font-semibold">{t}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{d}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function TrustBlock() {
  return (
    <section className="mt-16 grid gap-4 md:grid-cols-3">
      {[[ShieldCheck, 'Reviewed listings', 'Each ticket proof is checked by a person before the listing is public.', '/policies/authenticity'],
        [BadgeCheck, 'Verified payments only', 'Orders are confirmed from the bank payment record, never from a screenshot.', '/how-it-works'],
        [CreditCard, 'Clear refund rules', 'If a concert is cancelled or a ticket is not delivered, our refund policy applies.', '/policies/refunds']]
        .map(([Icon, t, d, to]) => (
          <Link key={t} to={to} className="card flex gap-4 p-5 transition hover:border-ink/20">
            <Icon className="mt-0.5 h-5 w-5 shrink-0 text-good" />
            <div><p className="font-semibold">{t}</p><p className="mt-1 text-sm text-muted">{d}</p></div>
          </Link>
        ))}
    </section>
  )
}
