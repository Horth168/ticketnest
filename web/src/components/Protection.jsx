// Buyer protection on the order page: "I received my ticket", "Report a problem" and the guarantee note.
import { AlertTriangle, Camera, CheckCircle2, ShieldCheck, X } from 'lucide-react'
import { confirmDialog } from './Dialog'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp, useLink } from '../context/App'
import { useT } from '../i18n'
import { api } from '../lib/api'
import { dateTime } from '../lib/format'
import { haptic } from '../lib/telegram'
import { Modal } from './ui'

export const REPORT_REASONS = [
  ['not_received', 'Ticket not received'],
  ['invalid', "Ticket didn't work / entry refused"],
  ['wrong', 'Wrong seat, category or quantity'],
  ['other', 'Other problem'],
]

export function GuaranteeNote({ className = '' }) {
  const { t } = useT()
  const link = useLink()
  return (
    <Link to={link('/guarantee')} className={`flex items-start gap-3 rounded-2xl border border-good/25 bg-good/5 p-4 transition hover:bg-good/10 ${className}`}>
      <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-good" />
      <span className="text-[13px] leading-relaxed">
        <b className="block text-[14px] text-ink">{t('TicketNest Guarantee')}</b>
        <span className="text-muted">{t('If your ticket never arrives or does not work, you get your money back. Sellers are only paid after the concert.')}</span>
      </span>
    </Link>
  )
}

export default function ProtectionPanel({ o, onChange }) {
  const { toast } = useApp()
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const issue = o.issue
  if (!['paid', 'preparing', 'awaiting_delivery', 'delivered', 'completed'].includes(o.status) && !issue) return null

  const confirm = async () => {
    if (!(await confirmDialog({ title: t('Got your ticket?'), message: t('Confirm you received your ticket and it looks right?'), confirmText: t('Yes, I got it'), cancelText: t('Not yet') }))) return
    setBusy(true)
    try { await api(`/api/orders/${o.order_number}/received`, { method: 'POST' }); haptic('success'); toast(t('Thanks! We let the team know.')); onChange() }
    catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  return (
    <div className="space-y-3">
      {issue?.status === 'open' && (
        <div className="card border-warn/40 p-5">
          <p className="flex items-center gap-2 font-semibold text-warn"><AlertTriangle className="h-5 w-5" />{t('Problem reported')}</p>
          <p className="mt-2 text-sm"><b>{t(REPORT_REASONS.find((r) => r[0] === issue.reason)?.[1] || 'Other problem')}</b> · <span className="text-muted">{dateTime(issue.opened_at)}</span></p>
          <p className="mt-1 whitespace-pre-line text-sm text-muted">“{issue.details}”</p>
          <p className="mt-3 rounded-xl bg-raised p-3 text-[13px] text-muted">{t("Our team is checking it and will contact you on Telegram. The seller won't be paid until this is resolved.")}</p>
        </div>
      )}
      {issue?.status === 'resolved' && (
        <div className="card p-5 text-sm">
          <p className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-5 w-5 text-good" />{t('Report resolved')}</p>
          <p className="mt-1 text-muted">{issue.resolution}</p>
        </div>
      )}
      {(o.can_confirm || o.can_report) && (
        <div className="card p-5">
          <p className="font-semibold">{['delivered', 'completed'].includes(o.status) ? t('Is everything OK with your ticket?') : t('Already got your ticket?')}</p>
          <p className="mt-1 text-[13px] text-muted">
            {o.report_deadline ? t('You can report a problem until {date}.', { date: dateTime(o.report_deadline) }) : t('Let us know if anything is wrong.')}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {o.can_confirm && <button className="btn-accent" disabled={busy} onClick={confirm}><CheckCircle2 className="h-4 w-4" />{t('I received my ticket')}</button>}
            {o.can_report && <button className="btn-ghost" onClick={() => setOpen(true)}><AlertTriangle className="h-4 w-4" />{t('Report a problem')}</button>}
          </div>
          {o.buyer_confirmed_at && <p className="mt-3 text-[13px] text-good">{t('You confirmed you received the ticket on {date}.', { date: dateTime(o.buyer_confirmed_at) })}</p>}
        </div>
      )}
      {!o.can_confirm && o.buyer_confirmed_at && !(o.can_report) && (
        <p className="text-[13px] text-good">{t('You confirmed you received the ticket on {date}.', { date: dateTime(o.buyer_confirmed_at) })}</p>
      )}
      <GuaranteeNote />
      {open && <ReportModal o={o} onClose={() => setOpen(false)} onDone={() => { setOpen(false); onChange() }} />}
    </div>
  )
}

const NEEDS_PHOTO = ['invalid', 'wrong']

function ReportModal({ o, onClose, onDone }) {
  const { toast } = useApp()
  const { t } = useT()
  const reasons = REPORT_REASONS.filter(([k]) => !(k === 'not_received' && o.buyer_confirmed_at))
  const [reason, setReason] = useState(reasons[0][0])
  const [details, setDetails] = useState('')
  const [photos, setPhotos] = useState([])
  const [busy, setBusy] = useState(false)
  const needPhoto = NEEDS_PHOTO.includes(reason)
  const addPhotos = (list) => setPhotos((p) => [...p, ...Array.from(list || [])].slice(0, 3))
  const submit = async () => {
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('reason', reason)
      fd.append('details', details.trim())
      photos.forEach((f) => fd.append('photos', f))
      await api(`/api/orders/${o.order_number}/report`, { method: 'POST', form: fd })
      haptic('warning'); toast(t('Report sent. Our team will contact you on Telegram.')); onDone()
    } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }
  return (
    <Modal open onClose={onClose} title={t('Report a problem')}>
      <p className="mb-3 rounded-xl bg-warn/10 p-3 text-[12.5px] leading-relaxed text-warn">
        {t('Report problems at the venue, as soon as they happen.')} {o.report_deadline && t('You can report until {date}.', { date: dateTime(o.report_deadline) })}
      </p>
      <div className="space-y-2">
        {reasons.map(([k, l]) => (
          <label key={k} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm transition ${reason === k ? 'border-accent bg-accent/5' : 'border-line'}`}>
            <input type="radio" name="reason" className="accent-[rgb(var(--accent))]" checked={reason === k} onChange={() => setReason(k)} />{t(l)}
          </label>
        ))}
      </div>
      <textarea className="input mt-3 min-h-[100px]" maxLength={2000} value={details} onChange={(e) => setDetails(e.target.value)}
        placeholder={t('What happened? Include anything that helps us check, e.g. what the gate staff said.')} />

      <p className="label mt-3">{needPhoto ? t('Photos from the venue (required)') : t('Photos (optional)')}</p>
      <div className="grid grid-cols-4 gap-2">
        {photos.map((f, i) => (
          <div key={i} className="relative aspect-square overflow-hidden rounded-xl border border-line">
            <img src={URL.createObjectURL(f)} alt="" className="h-full w-full object-cover" />
            <button type="button" onClick={() => setPhotos(photos.filter((_, j) => j !== i))} className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white" aria-label={t('Remove')}><X className="h-3.5 w-3.5" /></button>
          </div>
        ))}
        {photos.length < 3 && (
          <label className="grid aspect-square cursor-pointer place-items-center rounded-xl border border-dashed border-line text-muted transition hover:border-accent hover:text-accent">
            <Camera className="h-6 w-6" />
            <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { addPhotos(e.target.files); e.target.value = '' }} />
          </label>
        )}
      </div>
      <p className="mt-1.5 text-[12px] text-muted">{needPhoto ? t('A photo of the gate screen, the error on the ticket, or the seat you were given helps us confirm it with the seller.') : t('Up to 3 photos.')}</p>

      <p className="mt-3 text-[12px] text-muted">{t("Reporting freezes the seller's payout until our team has checked it. False reports lead to the account being closed.")}</p>
      <button className="btn-primary mt-4 w-full" disabled={busy || details.trim().length < 10 || (needPhoto && !photos.length)} onClick={submit}>{t('Send report')}</button>
    </Modal>
  )
}
