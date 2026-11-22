// "What fans say": approved customer reviews in a smooth, endless slider, plus the form to write one.
// Reviews only show after an admin approves them. Staff also see TicketNest's sample reviews (tagged),
// so the slider can be previewed before real reviews arrive; customers never see samples.
import { BadgeCheck, PenLine, Star } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp, useLink } from '../context/App'
import { useT } from '../i18n'
import { api } from '../lib/api'
import { cls } from '../lib/format'
import HumanCheck, { useHuman } from './HumanCheck'
import { Modal } from './ui'

function Stars({ n, size = 'h-4 w-4' }) {
  return <span className="flex gap-0.5">{[1, 2, 3, 4, 5].map((i) => <Star key={i} className={cls(size, i <= n ? 'fill-[#F5B301] text-[#F5B301]' : 'fill-line text-line')} />)}</span>
}

function ReviewCard({ r }) {
  const { t } = useT()
  return (
    <figure className="flex w-[290px] shrink-0 flex-col rounded-3xl border border-line bg-surface p-5 shadow-card sm:w-[340px]">
      <div className="flex items-center justify-between"><Stars n={r.rating} />{r.is_sample && <span className="rounded-full bg-warn/10 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wider text-warn">{t('Sample')}</span>}</div>
      <blockquote className="mt-3 line-clamp-4 flex-1 text-[14.5px] leading-relaxed">“{r.text}”</blockquote>
      <figcaption className="mt-4 flex items-center gap-3">
        {r.avatar_url
          ? <img src={r.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover" loading="lazy" />
          : <span className="holo-bg grid h-9 w-9 place-items-center rounded-full text-sm font-bold text-white">{r.name.replace('Sample · ', '').slice(0, 1)}</span>}
        <span className="min-w-0"><span className="block truncate text-sm font-semibold">{r.name.replace('Sample · ', '')}</span>
          {r.role && <span className="flex items-center gap-1 text-[12px] text-good"><BadgeCheck className="h-3.5 w-3.5" />{r.role === 'seller' ? t('Verified seller') : t('Verified buyer')}</span>}</span>
      </figcaption>
    </figure>
  )
}

function Row({ items, reverse }) {
  // repeat so one copy is wider than the screen, then loop by exactly half (-50%) for a seamless slide
  const reps = Math.max(2, Math.ceil(10 / items.length)) * 2
  const list = Array.from({ length: reps }, () => items).flat()
  return (
    <div className="marquee-mask overflow-hidden">
      <div className={cls('flex w-max gap-4 py-2 hover:[animation-play-state:paused] active:[animation-play-state:paused]', reverse ? 'marquee-rev' : 'marquee-slow')}>
        {list.map((r, i) => <div key={`${r.id}-${i}`} aria-hidden={i >= items.length || undefined}><ReviewCard r={r} /></div>)}
      </div>
    </div>
  )
}

export default function ReviewsSection() {
  const { user } = useApp()
  const { t } = useT()
  const [data, setData] = useState(null)
  const [open, setOpen] = useState(false)
  useEffect(() => { api('/api/reviews?preview=1').then(setData).catch(() => setData({ reviews: [] })) }, [user])
  if (!data) return null
  const rows = data.reviews
  const half = Math.ceil(rows.length / 2)
  return (
    <section className="mt-20">
      <div className="page flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">{t('Reviews')}</p>
          <h2 className="mt-1 text-2xl font-bold sm:text-3xl">{t('What fans say')}</h2>
          {data.count > 0 && <p className="mt-1 flex items-center gap-2 text-sm text-muted"><Stars n={Math.round(data.average)} size="h-3.5 w-3.5" />{t('{avg} from {n} reviews', { avg: data.average, n: data.count })}</p>}
          {data.preview && <p className="mt-1 text-[12px] font-semibold text-warn">{t('Staff preview: sample reviews are only visible to you.')}</p>}
        </div>
        <button className="btn-ghost" onClick={() => setOpen(true)}><PenLine className="h-4 w-4" />{t('Write a review')}</button>
      </div>
      {rows.length ? (
        <div className="mt-6 space-y-2">
          <Row items={rows.length > 5 ? rows.slice(0, half) : rows} />
          {rows.length > 5 && <div className="hidden sm:block"><Row items={rows.slice(half)} reverse /></div>}
        </div>
      ) : (
        <div className="page mt-6"><div className="card flex flex-col items-center px-6 py-10 text-center">
          <Stars n={5} size="h-6 w-6" />
          <p className="mt-3 font-display text-lg font-bold">{t('Be the first to review TicketNest')}</p>
          <p className="mt-1 max-w-sm text-sm text-muted">{t('Bought or sold a ticket with us? Tell other fans how it went.')}</p>
        </div></div>
      )}
      {open && <WriteReview onClose={() => setOpen(false)} />}
    </section>
  )
}

function WriteReview({ onClose }) {
  const { user, toast } = useApp()
  const { t } = useT()
  const nav = useNavigate()
  const link = useLink()
  const [rating, setRating] = useState(5)
  const [hover, setHover] = useState(0)
  const [text, setText] = useState('')
  const [mine, setMine] = useState(null)
  const [busy, setBusy] = useState(false)
  const human = useHuman()
  useEffect(() => {
    if (user) api('/api/reviews/mine').then((r) => { setMine(r); if (r.review) { setRating(r.review.rating); setText(r.review.text) } }).catch(() => {})
  }, [user])
  if (!user) {
    return (
      <Modal open onClose={onClose} title={t('Write a review')}>
        <p className="text-sm text-muted">{t('Sign in to write a review, so other fans know it comes from a real customer.')}</p>
        <button className="btn-primary mt-4 w-full" onClick={() => nav(link('/login?next=/'))}>{t('Sign in')}</button>
      </Modal>
    )
  }
  const submit = async () => {
    setBusy(true)
    try {
      await api('/api/reviews', { method: 'POST', body: { rating, text: text.trim() }, human: await human.token() })
      toast(t('Thank you! Your review will appear after our team approves it.'))
      onClose()
    } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }
  const status = mine?.review?.status
  return (
    <Modal open onClose={onClose} title={mine?.review ? t('Edit your review') : t('Write a review')}>
      {status && <p className={cls('mb-4 rounded-xl px-3 py-2 text-[13px]', status === 'approved' ? 'bg-good/10 text-good' : 'bg-warn/10 text-warn')}>
        {status === 'approved' ? t('Your review is published. Editing it sends it back for approval.') : status === 'pending' ? t('Your review is waiting for approval.') : t('Your last review was not approved. You can write a new one.')}</p>}
      <div className="flex justify-center gap-1.5" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((i) => (
          <button key={i} type="button" aria-label={`${i} / 5`} onMouseEnter={() => setHover(i)} onClick={() => setRating(i)} className="transition active:scale-90">
            <Star className={cls('h-9 w-9 transition', i <= (hover || rating) ? 'fill-[#F5B301] text-[#F5B301]' : 'fill-line text-line')} />
          </button>
        ))}
      </div>
      <textarea className="input mt-4 min-h-[120px]" maxLength={600} value={text} onChange={(e) => setText(e.target.value)}
        placeholder={t('How was buying or selling with TicketNest?')} />
      <p className="mt-1 text-right text-[12px] text-muted">{text.trim().length}/600</p>
      {mine?.role && <p className="mt-1 flex items-center gap-1 text-[12px] text-good"><BadgeCheck className="h-3.5 w-3.5" />{mine.role === 'seller' ? t('Shown as a verified seller') : t('Shown as a verified buyer')}</p>}
      <HumanCheck human={human} className="mt-3 flex justify-center" />
      <button className="btn-holo mt-4 w-full" disabled={busy || text.trim().length < 10} onClick={submit}>{t('Send for approval')}</button>
    </Modal>
  )
}
