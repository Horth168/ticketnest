import HumanCheck, { useHuman } from '../components/HumanCheck'
import { Check, ChevronLeft, FileText, ImagePlus, Info, QrCode, Receipt, Search, ShieldCheck, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Empty, ErrorNote, Field, Loading, Poster, Row, Spinner } from '../components/ui'
import { useApp, useLink } from '../context/App'
import { useT } from '../i18n'
import { api } from '../lib/api'
import { cls, dateLong, pct, TICKET_TYPES, usd2 } from '../lib/format'
import { haptic } from '../lib/telegram'
import { useMainButton } from '../tg/hooks'
import { PAYOUT_NOTE } from './account/Account'

const STEPS = ['Concert', 'Category', 'Ticket details', 'Proof & receipt', 'Contact & payout', 'Review']
const MAX = 5

function FileDrop({ icon: Icon, title, hint, files, onAdd, onRemove, accept = 'image/jpeg,image/png,image/webp,application/pdf', multiple = true }) {
  const { t } = useT()
  const [over, setOver] = useState(false)
  const input = useRef(null)
  return (
    <div>
      <div onClick={() => input.current?.click()} onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); onAdd([...e.dataTransfer.files]) }}
        className={cls('flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-all duration-200',
          over ? 'scale-[1.01] border-accent bg-accent/5' : 'border-line hover:border-accent/60 hover:bg-raised')}>
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-accent/10 text-accent"><Icon className="h-6 w-6" /></span>
        <span className="font-semibold">{title}</span><span className="max-w-sm text-[13px] text-muted">{hint}</span>
        <span className="text-[12px] text-muted">{t('Tap to choose, or drag files here')}</span>
        <input ref={input} type="file" className="sr-only" multiple={multiple} accept={accept} onChange={(e) => { onAdd([...e.target.files]); e.target.value = '' }} />
      </div>
      {files.map((file, i) => (
        <div key={i} className="pop mt-2 flex items-center gap-3 rounded-xl border border-line p-3 text-sm">
          {file.type?.startsWith('image/') ? <img src={URL.createObjectURL(file)} alt="" className="h-10 w-10 rounded-lg object-cover" /> : <FileText className="h-5 w-5 text-muted" />}
          <span className="flex-1 truncate">{file.name}</span><span className="text-muted">{Math.round(file.size / 1024)} KB</span>
          <button type="button" onClick={() => onRemove(i)} aria-label={t('Remove')} className="text-muted hover:text-bad"><Trash2 className="h-4 w-4" /></button>
        </div>
      ))}
    </div>
  )
}

export default function Sell() {
  const { user, toast, settings } = useApp()
  const { t } = useT()
  const nav = useNavigate()
  const link = useLink()
  const [step, setStep] = useState(0)
  const [concerts, setConcerts] = useState(null)
  const [concert, setConcert] = useState(null)
  const [q, setQ] = useState('')
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [f, setF] = useState({ category_id: null, original_price: '', price: '', quantity: 1, seat_info: '', ticket_type: 'e_ticket',
    notes: '', files: [], receipts: [], payout_qr: null, contact_name: user?.full_name || '', contact_phone: user?.phone || '',
    contact_telegram: user?.telegram_username || '', payout_method: user?.payout?.method || 'ABA',
    payout_account_name: user?.payout?.account_name || '', payout_account_number: user?.payout?.account_number || '', confirm_owner: false })
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))

  useEffect(() => { api('/api/concerts?size=60').then((r) => setConcerts(r.items)).catch(() => setConcerts([])) }, [])
  useEffect(() => {
    if (!f.price || Number(f.price) < 1) { setPreview(null); return }
    const tm = setTimeout(() => api(`/api/sell/preview?price=${encodeURIComponent(f.price)}`).then(setPreview).catch(() => setPreview(null)), 250)
    return () => clearTimeout(tm)
  }, [f.price])
  const pick = async (c) => { setConcert(await api(`/api/concerts/${c.slug}`)); set('category_id', null); setStep(1); haptic('light') }
  const go = (n) => { setStep(n); window.scrollTo({ top: 0, behavior: 'smooth' }) }

  const priceHigh = Number(f.price) > 0 && Number(f.original_price) > 0 && Number(f.price) > Number(f.original_price) * 3
  const human = useHuman()
  const cap = Number(settings?.protection?.price_cap_pct || 0)
  const overCap = !!(cap && Number(f.price) > 0 && Number(f.original_price) > 0 && Number(f.price) > Number(f.original_price) * cap / 100 + 1e-9)
  const ok = [
    !!concert, !!f.category_id,
    Number(f.original_price) >= 1 && Number(f.price) >= 1 && f.quantity >= 1 && f.quantity <= 20 && !overCap,
    f.files.length >= 1 && f.receipts.length >= 1,
    f.contact_name.trim().length >= 2 && f.contact_telegram.replace('@', '').trim().length >= 4 && f.payout_account_name.trim().length >= 2 && f.payout_account_number.trim().length >= 4,
    f.confirm_owner,
  ]
  const submit = async () => {
    setBusy(true); setError(null)
    const fd = new FormData()
    fd.append('concert_id', concert.id)
    Object.entries(f).forEach(([k, v]) => { if (!['files', 'receipts', 'payout_qr'].includes(k)) fd.append(k, typeof v === 'boolean' ? String(v) : v) })
    f.files.forEach((file) => fd.append('files', file))
    f.receipts.forEach((file) => fd.append('receipts', file))
    if (f.payout_qr) fd.append('payout_qr', f.payout_qr)
    try {
      await api('/api/sell/listings', { method: 'POST', form: fd, human: await human.token() })
      haptic('success')
      toast(t('Listing submitted for approval'))
      nav(link('/account/listings'), { replace: true })
    } catch (e) { setError(e); haptic('error') } finally { setBusy(false) }
  }
  const next = () => (step === 5 ? submit() : go(step + 1))
  useMainButton(step === 0 ? null : step === 5 ? t('Submit for approval') : t('Continue'), next, { enabled: ok[step], loading: busy })

  const shown = useMemo(() => (concerts || []).filter((c) => `${c.title} ${c.artist.name} ${c.city}`.toLowerCase().includes(q.toLowerCase())), [concerts, q])
  const cat = concert?.categories.find((c) => c.id === f.category_id)
  const addFiles = (key) => (list) => set(key, [...f[key], ...list].slice(0, MAX))
  const rmFile = (key) => (i) => set(key, f[key].filter((_, j) => j !== i))

  return (
    <div className="page max-w-3xl pt-8">
      <p className="eyebrow">{t('Sell tickets')}</p>
      <h1 key={step} className="rise mt-1 text-3xl font-bold">{t(STEPS[step])}</h1>
      <div className="mt-4 flex gap-1.5" aria-label={t('Step {a} of {b}', { a: step + 1, b: 6 })}>
        {STEPS.map((s, i) => <span key={s} className="h-1.5 flex-1 overflow-hidden rounded-full bg-line"><span className={cls('block h-full rounded-full bg-accent transition-all duration-500', i <= step ? 'w-full' : 'w-0')} /></span>)}
      </div>
      <p className="mt-2 text-[12px] text-muted">{t('Step {a} of {b}', { a: step + 1, b: 6 })}</p>
      {step > 0 && <button onClick={() => go(step - 1)} className="mt-3 inline-flex items-center gap-1 text-sm text-muted transition hover:-translate-x-0.5 hover:text-ink"><ChevronLeft className="h-4 w-4" />{t('Back')}</button>}

      <div key={`s${step}`} className="rise mt-6">
        {step === 0 && (!concerts ? <Loading /> : (
          <div>
            <div className="relative"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" /><input className="input pl-10" placeholder={t('Search your concert')} value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <div className="mt-4 space-y-2">
              {shown.map((c) => (
                <button key={c.id} onClick={() => pick(c)} className="card card-hover flex w-full items-center gap-4 p-3 text-left">
                  <div className="h-14 w-20 shrink-0 overflow-hidden rounded-xl"><Poster src={c.poster_url} title={c.title} artist={c.artist.name} /></div>
                  <div className="min-w-0"><p className="truncate font-semibold">{c.title}</p><p className="truncate text-sm text-muted">{c.artist.name} · {c.city} · {dateLong(c.starts_at)}</p></div>
                </button>
              ))}
              {!shown.length && <Empty title={t("Can't find your concert?")}>{t("Only concerts added by our team can be listed. Use the chat button or message support and we'll add it.")}</Empty>}
            </div>
          </div>
        ))}

        {step === 1 && concert && (
          <div className="grid gap-3 sm:grid-cols-2">
            {concert.categories.map((c) => (
              <button key={c.id} onClick={() => { set('category_id', c.id); go(2); haptic('light') }}
                className={cls('card card-hover p-4 text-left', f.category_id === c.id && 'border-accent ring-4 ring-accent/15')}>
                <p className="font-semibold">{c.name}</p>
                {c.description && <p className="mt-1 text-sm text-muted">{c.description}</p>}
                {c.face_value_cents && <p className="mt-2 text-[12px] text-muted">{t('Face value')} {usd2(c.face_value_cents)}</p>}
              </button>
            ))}
          </div>
        )}

        {step === 2 && (
          <div className="card space-y-4 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('Original ticket price (USD)')} hint={t('What you paid per ticket — you will prove it with the receipt')}><input className="input" inputMode="decimal" value={f.original_price} onChange={(e) => set('original_price', e.target.value)} placeholder="100" /></Field>
              <Field label={t('Your listing price (USD)')} hint={cap ? t('Per ticket · at most {pct}% of the original price', { pct: cap }) : t('Per ticket')}
                error={overCap ? t('Too high: the most you can ask is ${max}', { max: (Number(f.original_price) * cap / 100).toFixed(2) }) : undefined}>
                <input className="input" inputMode="decimal" value={f.price} onChange={(e) => set('price', e.target.value)} placeholder="100" /></Field>
              <Field label={t('Quantity')}><input className="input" type="number" min={1} max={20} value={f.quantity} onChange={(e) => set('quantity', Math.max(1, Math.min(20, Number(e.target.value) || 1)))} /></Field>
              <Field label={t('Ticket type')}><select className="input" value={f.ticket_type} onChange={(e) => set('ticket_type', e.target.value)}>{Object.entries(TICKET_TYPES).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}</select></Field>
            </div>
            <Field label={t('Seat number (if any)')}><input className="input" value={f.seat_info} onChange={(e) => set('seat_info', e.target.value)} placeholder={t('e.g. Block B, Row 12, Seats 5–6')} /></Field>
            <Field label={t('Additional information')}><textarea className="input min-h-[88px]" value={f.notes} onChange={(e) => set('notes', e.target.value)} placeholder={t('Anything a buyer should know (transfer method, restrictions…)')} /></Field>
            {priceHigh && <p className="rounded-xl bg-warn/10 p-3 text-[13px] text-warn">{t('This price is much higher than the original price. High prices sell slowly and may be rejected.')}</p>}
            {preview && (
              <div className="pop rounded-2xl bg-raised p-4">
                <Row k={t('Buyer pays per ticket')} v={usd2(preview.buyer_pays_cents)} />
                <Row k={`${t('TicketNest commission')} (${pct(preview.commission_bps)})`} v={`−${usd2(preview.commission_cents)}`} />
                <Row k={t('You receive per ticket')} v={usd2(preview.you_receive_cents)} strong />
                <p className="mt-2 text-[12px] text-muted">{t('Total for {n}: {amount}.', { n: f.quantity, amount: usd2(preview.you_receive_cents * f.quantity) })}</p>
                <p className="mt-3 flex gap-2 rounded-xl bg-accent/5 p-3 text-[12px] leading-relaxed text-muted"><Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" />{t(PAYOUT_NOTE)}</p>
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <div className="card p-5">
              <p className="font-semibold">1. {t('Ticket proof')}</p>
              <p className="mb-4 mt-1 text-sm text-muted">{t('Screenshots, photos or the PDF of your ticket showing the concert, category and seat.')}</p>
              <FileDrop icon={ImagePlus} title={t('Add ticket proof')} hint={t('JPG, PNG, WEBP or PDF · up to 5 files')} files={f.files} onAdd={addFiles('files')} onRemove={rmFile('files')} />
            </div>
            <div className="card p-5">
              <p className="font-semibold">2. {t('Purchase receipt')}</p>
              <p className="mb-4 mt-1 text-sm text-muted">{t('The order confirmation, payment receipt or email from the official seller. It proves the original price you entered.')}</p>
              <FileDrop icon={Receipt} title={t('Add purchase receipt')} hint={t('JPG, PNG, WEBP or PDF · up to 5 files')} files={f.receipts} onAdd={addFiles('receipts')} onRemove={rmFile('receipts')} />
            </div>
            <p className="flex gap-2 text-[13px] text-muted"><ShieldCheck className="h-4 w-4 shrink-0 text-good" />{t('Only our review team can see these files. They are never shown to buyers.')}</p>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6">
            <div className="card space-y-4 p-5">
              <p className="font-semibold">{t('Your contact')}</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('Your name')}><input className="input" value={f.contact_name} onChange={(e) => set('contact_name', e.target.value)} /></Field>
                <Field label={t('Telegram username')} hint={t('So our team can reach you')}><input className="input" value={f.contact_telegram} onChange={(e) => set('contact_telegram', e.target.value)} placeholder="@username" /></Field>
                <Field label={t('Phone (optional)')}><input className="input" inputMode="tel" value={f.contact_phone} onChange={(e) => set('contact_phone', e.target.value)} /></Field>
              </div>
            </div>
            <div className="card space-y-4 p-5">
              <p className="font-semibold">{t('Payout details')}</p>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label={t('Bank / wallet')}><select className="input" value={f.payout_method} onChange={(e) => set('payout_method', e.target.value)}>{['ABA', 'ACLEDA', 'Wing', 'Bakong', 'Other bank'].map((m) => <option key={m}>{m}</option>)}</select></Field>
                <Field label={t('Account name')}><input className="input" value={f.payout_account_name} onChange={(e) => set('payout_account_name', e.target.value)} /></Field>
                <Field label={t('Account number')}><input className="input" inputMode="numeric" value={f.payout_account_number} onChange={(e) => set('payout_account_number', e.target.value)} /></Field>
              </div>
              <div>
                <p className="mb-2 text-[13px] font-medium text-muted">{t('Your bank KHQR (recommended)')} {user?.payout?.has_qr && !f.payout_qr && <span className="text-good">· {t('Already on your profile')}</span>}</p>
                <FileDrop icon={QrCode} title={f.payout_qr ? t('QR added') : t('Upload your payout QR')} hint={t('So we can pay you in one scan. Only TicketNest admins can see it.')}
                  files={f.payout_qr ? [f.payout_qr] : []} accept="image/jpeg,image/png,image/webp" multiple={false}
                  onAdd={(l) => l[0] && set('payout_qr', l[0])} onRemove={() => set('payout_qr', null)} />
              </div>
              <p className="text-[12px] text-muted">{t('Your payout details are only visible to you and TicketNest admins.')}</p>
            </div>
          </div>
        )}

        {step === 5 && concert && cat && (
          <div className="space-y-4">
            <div className="card p-5">
              <p className="font-semibold">{concert.title}</p>
              <p className="text-sm text-muted">{concert.artist.name} · {concert.city} · {dateLong(concert.starts_at)}</p>
              <div className="mt-4">
                <Row k={t('Category')} v={cat.name} /><Row k={t('Quantity')} v={f.quantity} /><Row k={t('Seat')} v={f.seat_info || '—'} />
                <Row k={t('Ticket type')} v={t(TICKET_TYPES[f.ticket_type])} /><Row k={t('Original price')} v={`$${f.original_price}`} />
                <Row k={t('Listing price')} v={`$${f.price} ${t('each')}`} />
                <Row k={t('Ticket proof')} v={`${f.files.length} ${t('file(s)')}`} /><Row k={t('Purchase receipt')} v={`${f.receipts.length} ${t('file(s)')}`} />
                <Row k={t('Payout')} v={`${f.payout_method} · ${f.payout_account_number}${f.payout_qr || user?.payout?.has_qr ? ' · QR ✓' : ''}`} />
                {preview && <Row k={t('You receive if all sell')} v={usd2(preview.you_receive_cents * f.quantity)} strong />}
              </div>
              <p className="mt-4 flex gap-2 rounded-xl bg-accent/5 p-3 text-[13px] leading-relaxed text-muted"><Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" />{t(PAYOUT_NOTE)}</p>
            </div>
            <label className="card flex cursor-pointer gap-3 p-4 text-sm transition hover:border-ink/20">
              <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[rgb(var(--accent))]" checked={f.confirm_owner} onChange={(e) => set('confirm_owner', e.target.checked)} />
              <span className="text-muted">{t("I confirm these tickets are mine, genuine, and not listed for sale anywhere else, and that the receipt is real. I'll transfer them to the buyer when TicketNest asks.")} <Link to="/policies/terms" className="text-accent hover:underline">{t('Seller terms')}</Link></span>
            </label>
            <p className="flex gap-2 text-[13px] text-muted"><ShieldCheck className="h-4 w-4 shrink-0 text-good" />{t("Your listing goes live only after our team approves it. You'll get a message when it's reviewed.")}</p>
            <HumanCheck human={human} className="flex justify-center" />
            <ErrorNote error={error} />
          </div>
        )}
      </div>

      {step > 0 && !window.Telegram?.WebApp?.initData && (
        <div className="mt-6 flex justify-end">
          <button className="btn-accent px-6 py-3" disabled={!ok[step] || busy} onClick={next}>
            {busy && <Spinner className="h-4 w-4" />}{step === 5 ? <><Check className="h-4 w-4" />{t('Submit for approval')}</> : t('Continue')}
          </button>
        </div>
      )}
    </div>
  )
}

