import { createPortal } from 'react-dom'
import { Eye, EyeOff, Loader2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useT } from '../i18n'
import { cls, LISTING_STATUS, ORDER_STATUS } from '../lib/format'

export function Logo({ className = '', compact = false }) {
  return (
    <span className={cls('inline-flex items-center gap-2 font-display text-[19px] font-bold tracking-tight', className)}>
      <svg viewBox="0 0 64 64" className="h-7 w-7 shrink-0" aria-hidden>
        <rect width="64" height="64" rx="16" className="fill-ink" />
        <path d="M18 22h28v6H35v18h-6V28H18z" className="fill-bg" />
        <circle cx="46" cy="44" r="5" className="fill-accent" />
      </svg>
      {!compact && <span>Ticket<span className="text-accent">Nest</span></span>}
    </span>
  )
}

const TONES = {
  good: 'bg-good/10 text-good', warn: 'bg-warn/10 text-warn', bad: 'bg-bad/10 text-bad',
  accent: 'bg-accent/10 text-accent', muted: 'bg-muted/10 text-muted',
}
export function Badge({ tone = 'muted', children, className = '' }) {
  return <span className={cls('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-semibold', TONES[tone], className)}>{children}</span>
}
export function OrderBadge({ status }) {
  const { t } = useT()
  const [label, tone] = ORDER_STATUS[status] || [status, 'muted']
  return <Badge tone={tone}>{t(label)}</Badge>
}
export function ListingBadge({ status }) {
  const { t } = useT()
  const [label, tone] = LISTING_STATUS[status] || [status, 'muted']
  return <Badge tone={tone}>{t(label)}</Badge>
}

const AV_COLORS = ['#6D4BFF', '#E0457B', '#0EA5E9', '#F59E0B', '#10B981', '#8B5CF6']
export function Avatar({ user, size = 36, className = '' }) {
  const name = user?.full_name || '?'
  const initials = name.split(' ').filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
  const color = AV_COLORS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AV_COLORS.length]
  return user?.avatar_url
    ? <img src={user.avatar_url} alt="" width={size} height={size} className={cls('shrink-0 rounded-full object-cover', className)} style={{ width: size, height: size }} />
    : <span className={cls('grid shrink-0 place-items-center rounded-full font-semibold text-white', className)}
        style={{ width: size, height: size, background: color, fontSize: size * 0.38 }}>{initials}</span>
}

export const Spinner = ({ className = 'h-5 w-5' }) => <Loader2 className={cls('animate-spin', className)} aria-label="Loading" />

export function Loading({ label }) {
  const { t } = useT()
  return <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted"><Spinner /> {label || t('Loading…')}</div>
}

export function Empty({ icon: Icon, title, children, action }) {
  return (
    <div className="card flex flex-col items-center px-6 py-14 text-center">
      {Icon && <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-raised text-muted"><Icon className="h-6 w-6" /></div>}
      <p className="font-display text-lg font-semibold">{title}</p>
      {children && <p className="mt-1.5 max-w-sm text-sm text-muted">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function ErrorNote({ error }) {
  if (!error) return null
  return <p role="alert" className="rounded-xl border border-bad/25 bg-bad/5 px-3.5 py-2.5 text-sm text-bad">{String(error.message || error)}</p>
}

export function Field({ label, hint, error, children, className = '' }) {
  return (
    <label className={cls('block', className)}>
      {label && <span className="label">{label}</span>}
      {children}
      {error ? <span className="mt-1 block text-[12px] text-bad">{error}</span> : hint ? <span className="mt-1 block text-[12px] text-muted">{hint}</span> : null}
    </label>
  )
}

export function PasswordInput({ value, onChange, autoComplete = 'current-password', ...rest }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input className="input pr-11" type={show ? 'text' : 'password'} value={value} onChange={onChange} autoComplete={autoComplete} {...rest} />
      <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}
        className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted hover:text-ink">
        {show ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
      </button>
    </div>
  )
}

export function Modal({ open, onClose, title, children, wide = false }) {
  useEffect(() => {
    if (!open) return
    const k = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = prev }
  }, [open, onClose])
  if (!open) return null
  // Rendered into <body> so it is always centred on the screen, never inside an animated parent.
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-black/55 p-4 backdrop-blur-[2px] sm:p-6" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} onClick={(e) => e.stopPropagation()}
        className={cls('pop my-auto max-h-[calc(100dvh-2rem)] w-full overflow-auto rounded-3xl bg-surface p-5 shadow-lift sm:p-6', wide ? 'max-w-2xl' : 'max-w-md')}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="-m-1 rounded-lg p-1 text-muted hover:text-ink" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}

// Poster fallback when the admin hasn't uploaded one: a calm duotone tile with stage beams.
const HUES = [258, 340, 200, 20, 160, 290, 230]
export function Poster({ src, title, artist, className = '' }) {
  const [failed, setFailed] = useState(false)
  if (src && !failed) {
    return <img src={src} alt={title || artist || 'Concert poster'} loading="lazy" onError={() => setFailed(true)}
      className={cls('h-full w-full object-cover', className)} />
  }
  const seed = [...(artist || title || 'T')].reduce((a, c) => a + c.charCodeAt(0), 0)
  const h = HUES[seed % HUES.length]
  return (
    <div className={cls('relative h-full w-full overflow-hidden', className)} style={{ background: `hsl(${h} 30% 14%)`, containerType: 'inline-size' }} aria-label={title}>
      <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" aria-hidden>
        {[60, 160, 250, 340].map((x, i) => (
          <polygon key={x} points={`${x},0 ${x + 14},0 ${200 + (i - 1.5) * 70},300 ${200 + (i - 1.5) * 70 - 40},300`}
            fill={`hsl(${h} 80% 70%)`} opacity={0.08 + (i % 2) * 0.05} />
        ))}
        <path d="M0 300 Q 40 255 80 280 T 160 270 T 240 282 T 320 266 T 400 280 V300Z" fill={`hsl(${h} 25% 8%)`} />
      </svg>
      <div className="absolute inset-x-0 bottom-0 p-4">
        <p className="font-display text-2xl font-bold leading-none text-white/95">{artist || title}</p>
      </div>
    </div>
  )
}

export function Countdown({ seconds, onDone }) {
  const [left, setLeft] = useState(seconds)
  useEffect(() => setLeft(seconds), [seconds])
  useEffect(() => {
    if (left <= 0) { onDone?.(); return }
    const t = setTimeout(() => setLeft((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [left, onDone])
  const m = Math.floor(Math.max(0, left) / 60), s = Math.max(0, left) % 60
  return <span className="tabular-nums">{m}:{String(s).padStart(2, '0')}</span>
}

export function Stat({ label, value, hint }) {
  return (
    <div className="card p-4">
      <p className="text-[12px] font-medium text-muted">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-[12px] text-muted">{hint}</p>}
    </div>
  )
}

export function Row({ k, v, strong }) {
  return (
    <div className={cls('flex items-baseline justify-between gap-4 py-1.5 text-sm', strong && 'border-t border-line pt-3 text-base font-semibold')}>
      <span className={strong ? '' : 'text-muted'}>{k}</span><span className="text-right tabular-nums">{v}</span>
    </div>
  )
}
