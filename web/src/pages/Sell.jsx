import { Check, ChevronLeft, FileText, ImagePlus, Search, ShieldCheck, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Empty, ErrorNote, Field, Loading, Poster, Row, Spinner } from '../components/ui'
import { useApp, useLink } from '../context/App'
import { api } from '../lib/api'
import { cls, dateLong, pct, TICKET_TYPES, usd2 } from '../lib/format'
import { haptic } from '../lib/telegram'
import { useMainButton } from '../tg/hooks'

const STEPS = ['Concert', 'Category', 'Ticket details', 'Proof', 'Contact & payout', 'Review']

export default function Sell() {
  const { user, toast } = useApp()
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
    notes: '', files: [], contact_name: user?.full_name || '', contact_phone: user?.phone || '', contact_telegram: user?.telegram_username || '',
    payout_method: 'ABA', payout_account_name: '', payout_account_number: '', confirm_owner: false })
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))

  useEffect(() => { api('/api/concerts?size=60').then((r) => setConcerts(r.items)).catch(() => setConcerts([])) }, [])
  useEffect(() => {
    if (!f.price || Number(f.price) < 1) { setPreview(null); return }
    const t = setTimeout(() => api(`/api/sell/preview?price=${encodeURIComponent(f.price)}`).then(setPreview).catch(() => setPreview(null)), 250)
    return () => clearTimeout(t)
  }, [f.price])
  const pick = async (c) => { setConcert(await api(`/api/concerts/${c.slug}`)); set('category_id', null); setStep(1) }

  const ok = [
    !!concert, !!f.category_id,
    Number(f.original_price) >= 1 && Number(f.price) >= 1 && f.quantity >= 1 && f.quantity <= 20,
    f.files.length >= 1,
    f.contact_name.trim().length >= 2 && f.contact_telegram.replace('@', '').trim().length >= 4 && f.payout_account_name.trim().length >= 2 && f.payout_account_number.trim().length >= 4,
    f.confirm_owner,
  ]
  const submit = async () => {
    setBusy(true); setError(null)
    const fd = new FormData()
    fd.append('concert_id', concert.id)
    Object.entries(f).forEach(([k, v]) => { if (k !== 'files') fd.append(k, typeof v === 'boolean' ? String(v) : v) })
    f.files.forEach((file) => fd.append('files', file))
    try {
      await api('/api/sell/listings', { method: 'POST', form: fd })
      haptic('success')
      toast('Listing submitted for approval')
      nav(link('/account/listings'), { replace: true })
    } catch (e) { setError(e); haptic('error') } finally { setBusy(false) }
  }
  const next = () => (step === 5 ? submit() : setStep(step + 1))
  useMainButton(step === 0 ? null : step === 5 ? 'Submit for approval' : 'Continue', next, { enabled: ok[step], loading: busy })

  const shown = useMemo(() => (concerts || []).filter((c) => `${c.title} ${c.artist.name} ${c.city}`.toLowerCase().includes(q.toLowerCase())), [concerts, q])
  const cat = concert?.categories.find((c) => c.id === f.category_id)

  return (
    <div className="page max-w-3xl pt-8">
      <p className="eyebrow">Sell tickets</p>
      <h1 className="mt-1 text-3xl font-bold">{STEPS[step]}</h1>
      <div className="mt-4 flex gap-1.5" aria-label={`Step ${step + 1} of 6`}>
        {STEPS.map((s, i) => <span key={s} className={cls('h-1.5 flex-1 rounded-full transition', i <= step ? 'bg-accent' : 'bg-line')} />)}
      </div>
      {step > 0 && <button onClick={() => setStep(step - 1)} className="mt-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ChevronLeft className="h-4 w-4" />Back</button>}

      <div className="mt-6">
        {step === 0 && (!concerts ? <Loading /> : (
          <div>
            <div className="relative"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" /><input className="input pl-10" placeholder="Search your concert" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <div className="mt-4 space-y-2">
              {shown.map((c) => (
                <button key={c.id} onClick={() => pick(c)} className="card flex w-full items-center gap-4 p-3 text-left transition hover:border-accent">
                  <div className="h-14 w-20 shrink-0 overflow-hidden rounded-xl"><Poster src={c.poster_url} title={c.title} artist={c.artist.name} /></div>
                  <div className="min-w-0"><p className="truncate font-semibold">{c.title}</p><p className="truncate text-sm text-muted">{c.artist.name} · {c.city} · {dateLong(c.starts_at)}</p></div>
                </button>
              ))}
              {!shown.length && <Empty title="Can't find your concert?">Only concerts added by our team can be listed. Message support on Telegram and we'll add it.</Empty>}
            </div>
          </div>
        ))}

        {step === 1 && concert && (
          <div className="grid gap-3 sm:grid-cols-2">
            {concert.categories.map((c) => (
              <button key={c.id} onClick={() => { set('category_id', c.id); setStep(2) }}
                className={cls('card p-4 text-left transition hover:border-accent', f.category_id === c.id && 'border-accent ring-4 ring-accent/15')}>
                <p className="font-semibold">{c.name}</p>
                {c.description && <p className="mt-1 text-sm text-muted">{c.description}</p>}
                {c.face_value_cents && <p className="mt-2 text-[12px] text-muted">Face value {usd2(c.face_value_cents)}</p>}
              </button>
            ))}
          </div>
        )}

        {step === 2 && (
          <div className="card space-y-4 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Original ticket price (USD)" hint="What you paid, per ticket"><input className="input" inputMode="decimal" value={f.original_price} onChange={(e) => set('original_price', e.target.value)} placeholder="100" /></Field>
              <Field label="Your listing price (USD)" hint="Per ticket"><input className="input" inputMode="decimal" value={f.price} onChange={(e) => set('price', e.target.value)} placeholder="100" /></Field>
              <Field label="Quantity"><input className="input" type="number" min={1} max={20} value={f.quantity} onChange={(e) => set('quantity', Math.max(1, Math.min(20, Number(e.target.value) || 1)))} /></Field>
              <Field label="Ticket type"><select className="input" value={f.ticket_type} onChange={(e) => set('ticket_type', e.target.value)}>{Object.entries(TICKET_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            </div>
            <Field label="Seat number (if any)"><input className="input" value={f.seat_info} onChange={(e) => set('seat_info', e.target.value)} placeholder="e.g. Block B, Row 12, Seats 5–6" /></Field>
            <Field label="Additional information"><textarea className="input min-h-[88px]" value={f.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Anything a buyer should know (transfer method, restrictions…)" /></Field>
            {preview && (
              <div className="rounded-xl bg-raised p-4">
                <Row k="Buyer pays per ticket" v={usd2(preview.buyer_pays_cents)} />
                <Row k={`TicketNest commission (${pct(preview.commission_bps)})`} v={`−${usd2(preview.commission_cents)}`} />
                <Row k="You receive per ticket" v={usd2(preview.you_receive_cents)} strong />
                <p className="mt-1 text-[12px] text-muted">Total for {f.quantity}: {usd2(preview.you_receive_cents * f.quantity)}, paid to your wallet once the buyer receives the ticket.</p>
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="card space-y-4 p-5">
            <p className="text-sm text-muted">Upload photos, screenshots or the PDF of your ticket (up to 5 files, 8 MB each). Only our review team can see them — they are never shown to buyers.</p>
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-line px-6 py-10 text-center transition hover:border-accent">
              <ImagePlus className="h-8 w-8 text-muted" /><span className="font-semibold">Add ticket proof</span><span className="text-[13px] text-muted">JPG, PNG, WEBP or PDF</span>
              <input type="file" className="sr-only" multiple accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(e) => { set('files', [...f.files, ...e.target.files].slice(0, 5)); e.target.value = '' }} />
            </label>
            {f.files.map((file, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl border border-line p-3 text-sm">
                <FileText className="h-5 w-5 text-muted" /><span className="flex-1 truncate">{file.name}</span><span className="text-muted">{Math.round(file.size / 1024)} KB</span>
                <button onClick={() => set('files', f.files.filter((_, j) => j !== i))} aria-label="Remove file" className="text-muted hover:text-bad"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
        )}

        {step === 4 && (
          <div className="card space-y-4 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Your name"><input className="input" value={f.contact_name} onChange={(e) => set('contact_name', e.target.value)} /></Field>
              <Field label="Telegram username" hint="So our team can reach you"><input className="input" value={f.contact_telegram} onChange={(e) => set('contact_telegram', e.target.value)} placeholder="@username" /></Field>
              <Field label="Phone (optional)"><input className="input" inputMode="tel" value={f.contact_phone} onChange={(e) => set('contact_phone', e.target.value)} /></Field>
              <Field label="Payout bank / wallet"><select className="input" value={f.payout_method} onChange={(e) => set('payout_method', e.target.value)}>{['ABA', 'ACLEDA', 'Wing', 'Bakong', 'Other bank'].map((m) => <option key={m}>{m}</option>)}</select></Field>
              <Field label="Account name"><input className="input" value={f.payout_account_name} onChange={(e) => set('payout_account_name', e.target.value)} /></Field>
              <Field label="Account number"><input className="input" inputMode="numeric" value={f.payout_account_number} onChange={(e) => set('payout_account_number', e.target.value)} /></Field>
            </div>
            <p className="text-[12px] text-muted">Your payout details are only visible to you and TicketNest admins.</p>
          </div>
        )}

        {step === 5 && concert && cat && (
          <div className="space-y-4">
            <div className="card p-5">
              <p className="font-semibold">{concert.title}</p>
              <p className="text-sm text-muted">{concert.artist.name} · {concert.city} · {dateLong(concert.starts_at)}</p>
              <div className="mt-4">
                <Row k="Category" v={cat.name} /><Row k="Quantity" v={f.quantity} /><Row k="Seat" v={f.seat_info || '—'} />
                <Row k="Ticket type" v={TICKET_TYPES[f.ticket_type]} /><Row k="Original price" v={`$${f.original_price}`} />
                <Row k="Listing price" v={`$${f.price} each`} /><Row k="Proof files" v={f.files.length} />
                {preview && <Row k="You receive" v={`${usd2(preview.you_receive_cents * f.quantity)} total`} strong />}
              </div>
            </div>
            <label className="card flex cursor-pointer gap-3 p-4 text-sm">
              <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[rgb(var(--accent))]" checked={f.confirm_owner} onChange={(e) => set('confirm_owner', e.target.checked)} />
              <span className="text-muted">I confirm these tickets are mine, genuine, and not listed for sale anywhere else. I'll transfer them to the buyer when TicketNest asks. I agree to the <Link to="/policies/terms" className="text-accent hover:underline">seller terms</Link>.</span>
            </label>
            <p className="flex gap-2 text-[13px] text-muted"><ShieldCheck className="h-4 w-4 shrink-0 text-good" />Your listing goes live only after our team approves it. You'll get a message when it's reviewed.</p>
            <ErrorNote error={error} />
          </div>
        )}
      </div>

      {step > 0 && !window.Telegram?.WebApp?.initData && (
        <div className="mt-6 flex justify-end">
          <button className="btn-accent px-6 py-3" disabled={!ok[step] || busy} onClick={next}>
            {busy && <Spinner className="h-4 w-4" />}{step === 5 ? <><Check className="h-4 w-4" />Submit for approval</> : 'Continue'}
          </button>
        </div>
      )}
    </div>
  )
}
