import { CalendarDays, MapPin } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useLink } from '../context/App'
import { cls, dayParts, time, usd } from '../lib/format'
import { Poster } from './ui'

function tilt(e) {
  if (e.pointerType !== 'mouse') return
  const r = e.currentTarget.getBoundingClientRect()
  const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5
  e.currentTarget.style.setProperty('--ry', `${x * 5}deg`)
  e.currentTarget.style.setProperty('--rx', `${-y * 5}deg`)
}
function untilt(e) { e.currentTarget.style.setProperty('--ry', '0deg'); e.currentTarget.style.setProperty('--rx', '0deg') }

export function ConcertCard({ c, className = '' }) {
  const link = useLink()
  const d = dayParts(c.starts_at)
  const soldOut = !c.tickets_available
  return (
    <Link to={link(`/concerts/${c.slug}`)} onPointerMove={tilt} onPointerLeave={untilt}
      className={cls('tilt group block overflow-hidden rounded-2xl border border-line bg-surface hover:shadow-lift', className)}>
      <div className="relative aspect-[4/3] overflow-hidden bg-raised">
        <Poster src={c.poster_url} title={c.title} artist={c.artist?.name}
          className="transition duration-500 group-hover:scale-[1.03]" />
        <div className="absolute left-3 top-3 rounded-xl bg-surface/95 px-2.5 py-1.5 text-center shadow-card backdrop-blur">
          <p className="text-[10px] font-bold tracking-wider text-accent">{d.mon}</p>
          <p className="font-display text-xl font-bold leading-none">{d.day}</p>
        </div>
        {c.status === 'postponed' && <span className="absolute right-3 top-3 rounded-full bg-warn px-2.5 py-1 text-[11px] font-bold text-white">POSTPONED</span>}
      </div>
      <div className="p-4">
        <p className="eyebrow">{c.artist?.name}</p>
        <h3 className="mt-1 line-clamp-2 text-[17px] font-semibold leading-snug">{c.title}</h3>
        <p className="mt-2 flex items-center gap-1.5 text-[13px] text-muted"><MapPin className="h-3.5 w-3.5" />{c.venue} · {c.city}</p>
        <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
          <span className="flex items-center gap-1.5 text-[13px] text-muted"><CalendarDays className="h-3.5 w-3.5" />{d.dow} · {time(c.starts_at)}</span>
          {soldOut
            ? <span className="text-[13px] font-bold tracking-wide text-muted">SOLD OUT</span>
            : <span className="text-[13px]"><span className="text-muted">from </span><b className="text-[15px]">{usd(c.from_price_cents)}</b></span>}
        </div>
      </div>
    </Link>
  )
}

export function ArtistTile({ a }) {
  const link = useLink()
  const initials = a.name.replace(/[^A-Za-z0-9 ]/g, '').split(' ').map((w) => w[0]).join('').slice(0, 2)
  return (
    <Link to={link(`/artists/${a.slug}`)} className="group flex w-[112px] shrink-0 flex-col items-center gap-2.5 text-center">
      <div className="grid h-[96px] w-[96px] place-items-center overflow-hidden rounded-full border border-line bg-raised ring-accent/0 transition group-hover:ring-4 group-hover:ring-accent/20">
        {a.image_url ? <img src={a.image_url} alt={a.name} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
          : <span className="font-display text-2xl font-bold text-muted">{initials}</span>}
      </div>
      <span className="line-clamp-1 text-[13px] font-semibold">{a.name}</span>
    </Link>
  )
}

export function SkeletonCards({ n = 4 }) {
  return Array.from({ length: n }, (_, i) => (
    <div key={i} className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="skeleton aspect-[4/3] rounded-none" />
      <div className="space-y-2 p-4"><div className="skeleton h-3 w-1/3" /><div className="skeleton h-4 w-4/5" /><div className="skeleton h-3 w-1/2" /></div>
    </div>
  ))
}
