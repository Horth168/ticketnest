import { ArrowRight, BadgeCheck, CreditCard, MessageCircle, ShieldCheck, ShoppingBag, Sparkles, Tag, Ticket, Upload, Zap } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArtistTile, ConcertCard, isLogo, SkeletonCards } from '../components/cards'
import { SearchBox, TelegramIcon, useMiniAppUrl } from '../components/Layout'
import LiveStage from '../components/LiveStage'
import { Reveal } from '../components/Motion'
import ReviewsSection from '../components/Reviews'
import { Empty, ErrorNote } from '../components/ui'
import { useApp } from '../context/App'
import { useT } from '../i18n'
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
  const { t } = useT()
  const markup = settings?.fees?.buyer_markup_bps
  return (
    <>
      <section className="relative overflow-hidden text-white">
        <LiveStage />
        <div className="page relative flex min-h-[560px] flex-col justify-center py-16 sm:min-h-[640px] sm:py-24">
          <p className="rise holo-ring inline-flex w-fit items-center gap-2 rounded-full bg-white/[.06] px-3 py-1.5 text-[12px] font-semibold tracking-wide text-white/85 backdrop-blur">
            <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#7CF29C] opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-[#7CF29C]" /></span>
            {t('K-pop concert ticket resale · Cambodia')}
          </p>
          <h1 className="rise mt-5 max-w-3xl text-[40px] font-bold leading-[1.04] sm:text-[66px]" style={{ animationDelay: '80ms' }}>
            {t('Your seat at the show,')} <span className="holo-text">{t("from fans who can't go.")}</span>
          </h1>
          <p className="rise mt-5 max-w-xl text-[17px] leading-relaxed text-white/75" style={{ animationDelay: '160ms' }}>
            {t('Every listing is checked by our team before it goes live. Pay securely with KHQR and get your ticket through Telegram.')}
          </p>
          <div className="rise mt-8 max-w-xl" style={{ animationDelay: '240ms' }}><SearchBox big /></div>
          {data?.artists?.length > 0 && (
            <div className="rise no-scrollbar -mx-4 mt-5 flex items-center gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0" style={{ animationDelay: '320ms' }}>
              <span className="shrink-0 text-[11px] font-bold uppercase tracking-[.16em] text-white/50">{t('Trending')}</span>
              {data.artists.slice(0, 7).map((a) => (
                <Link key={a.id} to={`/artists/${a.slug}`} className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/15 bg-white/[.06] py-1 pl-1 pr-3 text-[13px] font-medium text-white/90 backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:border-white/40 hover:bg-white/15">
                  {a.image_url && !isLogo(a.image_url)
                    ? <img src={a.image_url} alt="" className="h-6 w-6 rounded-full object-cover" loading="lazy" />
                    : <span className="holo-bg grid h-6 w-6 place-items-center rounded-full text-[10px] font-bold text-white">{a.name.slice(0, 1)}</span>}
                  {a.name}
                </Link>
              ))}
            </div>
          )}
          <div className="rise mt-8 grid grid-cols-1 gap-2.5 text-[13px] text-white/70 sm:mt-10 sm:flex sm:flex-wrap sm:gap-x-8" style={{ animationDelay: '400ms' }}>
            {[[ShieldCheck, t('Every listing reviewed')], [Zap, t('Instant KHQR payment')], [MessageCircle, t('Delivered via Telegram')]].map(([Icon, l]) => (
              <span key={l} className="flex items-center gap-2"><Icon className="h-4 w-4 text-[#C4B5FF]" />{l}</span>
            ))}
          </div>
        </div>
      </section>

      {data?.artists?.length > 0 && <ArtistMarquee artists={data.artists} />}

      <div className="page">
        <ErrorNote error={error} />
        <BuySell />
        <Section title={t('Featured concerts')} to="/concerts" className="mt-14">
          {!data ? <Grid><SkeletonCards n={3} /></Grid>
            : data.featured.length ? <Grid>{data.featured.map((c, i) => <Reveal key={c.id} delay={i * 80}><ConcertCard c={c} /></Reveal>)}</Grid>
            : <Empty icon={Ticket} title={t('No concerts yet')}>{t('New concerts appear here as soon as our team adds them.')}</Empty>}
        </Section>

        {data?.artists?.length > 0 && (
          <Section title={t('Popular artists')} to="/artists">
            <div className="no-scrollbar -mx-4 flex gap-4 overflow-x-auto px-4 pb-2">{data.artists.map((a) => <ArtistTile key={a.id} a={a} />)}</div>
          </Section>
        )}

        {data?.upcoming?.length > 3 && (
          <Section title={t('Upcoming events')} to="/concerts">
            <Grid four>{data.upcoming.slice(0, 8).map((c, i) => <Reveal key={c.id} delay={(i % 4) * 70}><ConcertCard c={c} /></Reveal>)}</Grid>
          </Section>
        )}

        {data?.recent_listings?.length > 0 && (
          <Section title={t('Recently listed tickets')} to="/concerts?available=1">
            <Reveal className="card divide-y divide-line overflow-hidden">
              {data.recent_listings.map((l) => (
                <Link key={l.id} to={`/concerts/${l.concert.slug}`} className="group flex items-center gap-4 p-4 transition hover:bg-raised">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-accent/10 font-display text-sm font-bold text-accent transition group-hover:scale-105">{l.category.slice(0, 4)}</div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{l.concert.title}</p>
                    <p className="truncate text-[13px] text-muted">{l.concert.artist.name} · {l.concert.city} · {dateShort(l.concert.starts_at)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold tabular-nums">{usd(l.buyer_price_cents)}</p>
                    <p className="text-[12px] text-muted">{t('{n} left', { n: l.available })}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 -translate-x-1 text-muted opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100" />
                </Link>
              ))}
            </Reveal>
          </Section>
        )}

        {data?.categories?.length > 0 && (
          <Section title={t('Ticket categories on sale')}>
            <div className="flex flex-wrap gap-2">
              {data.categories.map((c) => <Link key={c.name} to={`/concerts?category=${encodeURIComponent(c.name)}`} className="chip">{c.name}<span className="text-muted">{c.listings}</span></Link>)}
            </div>
          </Section>
        )}

        <HowItWorksStrip markup={markup} />
        <TelegramPromo />

        <Reveal as="section" className="relative mt-20 overflow-hidden rounded-3xl bg-ink p-8 text-bg sm:p-12">
          <div className="glow absolute -right-20 -top-20 h-72 w-72 rounded-full bg-accent/40 blur-3xl" />
          <div className="relative grid gap-6 md:grid-cols-[1.4fr_1fr] md:items-center">
            <div>
              <p className="eyebrow !text-bg/60">{t("Can't make the show?")}</p>
              <h2 className="mt-3 text-3xl font-bold sm:text-4xl">{t('Sell your tickets to real fans.')}</h2>
              <p className="mt-3 max-w-lg text-bg/70">{t('List in a few minutes. Our team reviews your ticket, handles payment and delivery, and pays you after the buyer receives the ticket.')}</p>
            </div>
            <div className="md:text-right"><Link to="/sell" className="btn bg-bg px-6 py-3.5 text-ink hover:-translate-y-0.5 hover:shadow-lift">{t('Start selling')} <ArrowRight className="h-4 w-4" /></Link></div>
          </div>
        </Reveal>

        <TrustBlock />
      </div>
      <ReviewsSection />
    </>
  )
}

function ArtistMarquee({ artists }) {
  const { t } = useT()
  // repeat the set so one copy is always wider than the screen, then loop by exactly one copy (-50%)
  const reps = Math.max(2, Math.ceil(16 / artists.length)) * 2
  const list = Array.from({ length: reps }, () => artists).flat()
  return (
    <section className="border-b border-line bg-surface py-7 sm:py-8" aria-label={t('Artists on TicketNest')}>
      <p className="mb-5 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">{t('Artists on TicketNest')}</p>
      <div className="marquee-mask overflow-hidden">
        <div className="marquee flex w-max items-center gap-3 py-1 hover:[animation-play-state:paused] sm:gap-4">
          {list.map((a, i) => (
            <Link key={`${a.id}-${i}`} to={`/artists/${a.slug}`} title={a.name} aria-hidden={i >= artists.length || undefined}
              tabIndex={i >= artists.length ? -1 : undefined}
              className="group flex h-14 w-36 shrink-0 items-center justify-center gap-2.5 rounded-2xl border border-black/[.06] bg-white px-4 shadow-[0_1px_2px_rgba(0,0,0,.04)] transition duration-300 hover:-translate-y-0.5 hover:shadow-card sm:h-16 sm:w-44">
              {a.image_url && isLogo(a.image_url)
                ? <img src={a.image_url} alt={a.name} loading="lazy" draggable="false"
                    className="max-h-7 max-w-[100px] object-contain opacity-90 transition duration-300 group-hover:opacity-100 sm:max-h-8 sm:max-w-[120px]" />
                : <>
                    {a.image_url && <img src={a.image_url} alt="" loading="lazy" className="h-8 w-8 shrink-0 rounded-full object-cover" />}
                    <span className="truncate font-display text-[14px] font-bold tracking-tight text-neutral-800">{a.name}</span>
                  </>}
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}

function Section({ title, to, children, className = 'mt-16' }) {
  const { t } = useT()
  return (
    <section className={className}>
      <Reveal className="mb-5 flex items-end justify-between gap-4">
        <h2 className="text-[26px] font-bold">{title}</h2>
        {to && <Link to={to} className="group flex items-center gap-1 text-sm font-semibold text-accent">{t('See all')} <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></Link>}
      </Reveal>
      {children}
    </section>
  )
}
const Grid = ({ children, four }) => <div className={`grid gap-5 sm:grid-cols-2 ${four ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>{children}</div>

export function HowItWorksStrip({ markup }) {
  const { t } = useT()
  const steps = [
    [Upload, t('Sellers list'), t('Fans submit their tickets with proof and the purchase receipt. Nothing goes live until our team approves it.')],
    [CreditCard, t('You pay by KHQR'), t('Scan with ABA or any Bakong banking app. The price you see includes our {pct} marketplace fee.', { pct: markup != null ? `${markup / 100}%` : '' })],
    [BadgeCheck, t('Payment is verified'), t('Your order is confirmed only after the bank payment is matched. You get an email and invoice.')],
    [MessageCircle, t('Ticket via Telegram'), t('Our team contacts you on Telegram and sends your ticket. Your order shows when it is delivered.')],
  ]
  return (
    <section className="mt-20">
      <Reveal><h2 className="text-[26px] font-bold">{t('How TicketNest works')}</h2></Reveal>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map(([Icon, title, d], i) => (
          <Reveal key={title} delay={i * 90} className="card card-hover group p-5">
            <div className="flex items-center justify-between">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-accent/10 text-accent transition duration-300 group-hover:scale-110 group-hover:bg-accent group-hover:text-accent-ink"><Icon className="h-5 w-5" /></span>
              <span className="font-display text-sm font-bold text-muted">0{i + 1}</span>
            </div>
            <p className="mt-4 font-semibold">{title}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{d}</p>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

function TelegramPromo() {
  const { t } = useT()
  const url = useMiniAppUrl()
  return (
    <Reveal as="section" className="mt-20 grid items-center gap-8 overflow-hidden rounded-3xl border border-[#229ED9]/25 bg-gradient-to-br from-[#229ED9]/10 via-surface to-surface p-8 sm:p-10 md:grid-cols-[1fr_auto]">
      <div>
        <span className="inline-flex items-center gap-2 rounded-full bg-[#229ED9]/15 px-3 py-1 text-[12px] font-semibold text-[#229ED9]"><Sparkles className="h-3.5 w-3.5" />{t('New')}</span>
        <h2 className="mt-3 text-3xl font-bold">{t('TicketNest inside Telegram')}</h2>
        <p className="mt-2 max-w-lg text-muted">{t('Buy, sell and track your tickets without leaving Telegram. One tap to sign in, no download, and order updates straight to your chat.')}</p>
        <a href={url} target="_blank" rel="noreferrer" className="btn mt-5 bg-[#229ED9] px-5 py-3 text-white hover:brightness-110"><TelegramIcon className="h-5 w-5" />{t('Open in Telegram')}</a>
      </div>
      <div className="float mx-auto hidden w-fit rounded-3xl bg-white p-4 shadow-lift md:block">
        <QRCodeSVG value={url} size={168} />
        <p className="mt-2 text-center text-[12px] font-medium text-neutral-500">{t('Scan with your phone')}</p>
      </div>
    </Reveal>
  )
}

function TrustBlock() {
  const { t } = useT()
  return (
    <section className="mt-16 grid gap-4 md:grid-cols-3">
      {[[ShieldCheck, t('Reviewed listings'), t('Each ticket proof and purchase receipt is checked by a person before the listing is public.'), '/policies/authenticity'],
        [BadgeCheck, t('Verified payments only'), t('Orders are confirmed from the bank payment record, never from a screenshot.'), '/how-it-works'],
        [CreditCard, t('Clear refund rules'), t('If a concert is cancelled or a ticket is not delivered, our refund policy applies.'), '/policies/refunds']]
        .map(([Icon, title, d, to], i) => (
          <Reveal key={title} delay={i * 90}>
            <Link to={to} className="card card-hover flex h-full gap-4 p-5">
              <Icon className="mt-0.5 h-5 w-5 shrink-0 text-good" />
              <div><p className="font-semibold">{title}</p><p className="mt-1 text-sm text-muted">{d}</p></div>
            </Link>
          </Reveal>
        ))}
    </section>
  )
}

// Two sides of the marketplace, given equal weight.
function BuySell() {
  const { t } = useT()
  return (
    <div className="mt-8 grid gap-3 sm:mt-12 sm:grid-cols-2 sm:gap-4">
      <Reveal className="h-full">
        <Link to="/concerts" className="group relative flex h-full items-center gap-4 overflow-hidden rounded-3xl p-5 text-white shadow-card transition hover:-translate-y-0.5 hover:shadow-lift sm:p-6">
          <span className="holo-bg absolute inset-0" />
          <span className="absolute -right-8 -top-10 h-40 w-40 rounded-full bg-white/20 blur-2xl" />
          <span className="relative grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/20 backdrop-blur"><ShoppingBag className="h-6 w-6" /></span>
          <span className="relative min-w-0 flex-1">
            <span className="block text-[11px] font-bold uppercase tracking-[.16em] text-white/80">{t('Buy from fans')}</span>
            <span className="mt-0.5 block font-display text-xl font-bold">{t('Buy tickets')}</span>
            <span className="mt-1 block text-[13px] leading-snug text-white/85">{t('Every listing is checked by our team. Pay with KHQR and get your ticket through Telegram.')}</span>
          </span>
          <ArrowRight className="relative h-5 w-5 shrink-0 transition group-hover:translate-x-1" />
        </Link>
      </Reveal>
      <Reveal delay={80} className="h-full">
        <Link to="/sell" className="group relative flex h-full items-center gap-4 overflow-hidden rounded-3xl bg-ink p-5 text-bg shadow-card transition hover:-translate-y-0.5 hover:shadow-lift sm:p-6">
          <span className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-accent/40 blur-3xl" />
          <span className="relative grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-bg/10"><Tag className="h-6 w-6" /></span>
          <span className="relative min-w-0 flex-1">
            <span className="block text-[11px] font-bold uppercase tracking-[.16em] text-bg/60">{t('Sell to fans')}</span>
            <span className="mt-0.5 block font-display text-xl font-bold">{t('Sell tickets')}</span>
            <span className="mt-1 block text-[13px] leading-snug text-bg/70">{t("Can't go? List your ticket in minutes. You're paid after the buyer receives it.")}</span>
          </span>
          <ArrowRight className="relative h-5 w-5 shrink-0 transition group-hover:translate-x-1" />
        </Link>
      </Reveal>
    </div>
  )
}
