// The TicketNest Guarantee: what buyers are protected against and how it works. Every promise here is
// enforced by the system (payout hold, report window, refunds), not just written down.
import { BadgeCheck, Clock, FileSearch, Lock, MessageCircle, RotateCcw, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Reveal } from '../components/Motion'
import { useApp, useLink } from '../context/App'
import { useT } from '../i18n'
import { usePageMeta } from '../lib/seo'

export default function Guarantee() {
  const { settings } = useApp()
  const { t } = useT()
  const link = useLink()
  const p = settings?.protection || {}
  const hold = p.payout_hold_hours ?? 48
  const window_ = p.report_window_hours ?? 6
  usePageMeta({ title: t('TicketNest Guarantee'), description: t('If your ticket never arrives or does not work, you get your money back. Sellers are only paid after the concert.') })
  const points = [
    [FileSearch, t('Every listing is checked'), t("Our team reviews each seller's ticket proof and purchase receipt before the listing goes on sale.")],
    [Lock, t('Sellers are paid after the concert'), t('Your money stays with TicketNest until {h} hours after the concert starts. A seller cannot take the money and disappear.', { h: hold })],
    [Clock, t('Report problems at the venue'), t('If your ticket does not work, report it from your order page straight away, with a photo. Reports are open until {h} hours after the concert starts, and freeze the payment to the seller.', { h: window_ })],
    [RotateCcw, t('Money back when it goes wrong'), t('If your ticket never arrives, is invalid, or is not what you paid for, we refund you, or find you an equal or better ticket.')],
    [BadgeCheck, t('Payments confirmed by the bank'), t('Orders are confirmed from the bank payment record, never from a screenshot.')],
  ]
  return (
    <div className="page max-w-3xl pt-8 sm:pt-12">
      <Reveal className="relative overflow-hidden rounded-[28px] p-6 text-white sm:p-10">
        <span className="holo-bg absolute inset-0" />
        <span className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/20 blur-3xl" />
        <div className="relative">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white/20 backdrop-blur"><ShieldCheck className="h-7 w-7" /></span>
          <h1 className="mt-4 text-[30px] font-bold leading-tight sm:text-[40px]">{t('TicketNest Guarantee')}</h1>
          <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-white/90">{t('If your ticket never arrives or does not work, you get your money back. Sellers are only paid after the concert.')}</p>
        </div>
      </Reveal>
      <div className="mt-8 space-y-3">
        {points.map(([Icon, title, body], i) => (
          <Reveal key={title} delay={i * 60} className="card flex gap-4 p-5">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent"><Icon className="h-5 w-5" /></span>
            <div><p className="font-semibold">{title}</p><p className="mt-1 text-sm leading-relaxed text-muted">{body}</p></div>
          </Reveal>
        ))}
      </div>
      <div className="card mt-8 p-5 sm:p-6">
        <p className="font-semibold">{t('How to use it')}</p>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-muted">
          <li>{t('Open your order in My tickets.')}</li>
          <li>{t('Tap "Report a problem", choose what happened and add details.')}</li>
          <li>{t('Our team checks it with the seller and contacts you on Telegram, usually within 24 hours.')}</li>
        </ol>
        <p className="mt-4 text-[13px] text-muted">{t('The guarantee covers tickets bought and paid on TicketNest. It does not cover a concert being cancelled by the organiser (our refund policy applies), entry refused for reasons not related to the ticket (e.g. age limits or prohibited items), or not attending. False reports lead to the account being closed.')}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link to={link('/tickets')} className="btn-primary">{t('My tickets')}</Link>
          <Link to={link('/policies/refunds')} className="btn-ghost">{t('Refund policy')}</Link>
          <Link to={link('/support')} className="btn-ghost"><MessageCircle className="h-4 w-4" />{t('Support')}</Link>
        </div>
      </div>
    </div>
  )
}
