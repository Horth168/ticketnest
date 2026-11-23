import { usePageMeta } from '../lib/seo'
import { ChevronDown, RotateCcw, Search, SlidersHorizontal, Ticket, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import { ArtistTile, ConcertCard, SkeletonCards } from '../components/cards'
import { Empty, ErrorNote } from '../components/ui'
import { api } from '../lib/api'
import { useT } from '../i18n'
import { Reveal } from '../components/Motion'
import { cls } from '../lib/format'

const KEYS = ['q', 'artist', 'country', 'city', 'venue', 'category', 'date_from', 'date_to', 'available']

export default function Explore({ compact = false }) {
  usePageMeta({ title: 'Buy K-pop concert tickets', description: 'All upcoming K-pop concerts with verified resale tickets on TicketNest. Pay with KHQR, get your ticket on Telegram.' })
  const { t } = useT()
  const [params, setParams] = useSearchParams()
  const [filters, setFilters] = useState(null)
  const [res, setRes] = useState(null)
  const [error, setError] = useState(null)
  const [open, setOpen] = useState(false)
  const qs = useMemo(() => {
    const p = new URLSearchParams()
    KEYS.forEach((k) => params.get(k) && p.set(k, k === 'available' ? 'true' : params.get(k)))
    return p.toString()
  }, [params])

  useEffect(() => { api('/api/concerts/filters').then(setFilters).catch(() => {}) }, [])
  useEffect(() => {
    setRes(null)
    api(`/api/concerts?${qs}`).then(setRes).catch(setError)
  }, [qs])

  const set = (k, v) => {
    const p = new URLSearchParams(params)
    v ? p.set(k, v) : p.delete(k)
    if (k === 'country') p.delete('city')
    setParams(p, { replace: true })
  }
  const active = KEYS.filter((k) => params.get(k) && k !== 'q')
  const cities = (filters?.cities || []).filter((c) => !params.get('country') || c.country === params.get('country'))

  const reset = () => {
    const p = new URLSearchParams()
    if (params.get('q')) p.set('q', params.get('q'))
    setParams(p, { replace: true })
  }

  const panel = (
    <div className="space-y-3.5">
      <Sel label={t('Artist')} value={params.get('artist')} onChange={(v) => set('artist', v)} options={(filters?.artists || []).map((a) => [a.slug, a.name])} />
      <div className="grid grid-cols-2 gap-3">
        <Sel label={t('Country')} value={params.get('country')} onChange={(v) => set('country', v)} options={(filters?.countries || []).map((c) => [c, c])} />
        <Sel label={t('City')} value={params.get('city')} onChange={(v) => set('city', v)} options={cities.map((c) => [c.city, c.city])} />
      </div>
      <Sel label={t('Venue')} value={params.get('venue')} onChange={(v) => set('venue', v)} options={(filters?.venues || []).map((c) => [c, c])} />
      <Sel label={t('Ticket category')} value={params.get('category')} onChange={(v) => set('category', v)} options={(filters?.categories || []).map((c) => [c, c])} />
      <div className="grid grid-cols-2 gap-3">
        <label className="block min-w-0"><span className="label">{t('From')}</span><input type="date" className="input h-12" value={params.get('date_from')?.slice(0, 10) || ''} onChange={(e) => set('date_from', e.target.value)} /></label>
        <label className="block min-w-0"><span className="label">{t('To')}</span><input type="date" className="input h-12" value={params.get('date_to')?.slice(0, 10) || ''} onChange={(e) => set('date_to', e.target.value ? `${e.target.value}T23:59:59` : '')} /></label>
      </div>
      <button type="button" role="switch" aria-checked={!!params.get('available')} onClick={() => set('available', params.get('available') ? '' : '1')}
        className="flex w-full items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5 text-left text-sm font-medium transition hover:bg-raised">
        {t('Only concerts with tickets available')}
        <span className={cls('relative h-6 w-11 shrink-0 rounded-full transition', params.get('available') ? 'bg-accent' : 'bg-line')}>
          <span className={cls('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', params.get('available') ? 'left-[22px]' : 'left-0.5')} />
        </span>
      </button>
    </div>
  )

  return (
    <div className={cls('page', compact ? 'pt-4' : 'pt-10')}>
      {!compact && <h1 className="rise text-4xl font-bold">{t('Explore concerts')}</h1>}
      <div className="mt-5 flex items-center gap-2">
        <div className="relative min-w-0 max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="input h-12 pl-10" placeholder={t('Search artist, concert, city or venue')} defaultValue={params.get('q') || ''} enterKeyHint="search"
            onKeyDown={(e) => e.key === 'Enter' && set('q', e.currentTarget.value.trim())} onBlur={(e) => set('q', e.currentTarget.value.trim())} aria-label="Search" />
        </div>
        <button className="relative grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-line bg-surface transition hover:bg-raised active:scale-95 lg:hidden"
          onClick={() => setOpen(true)} aria-label={t('Filters')}>
          <SlidersHorizontal className="h-5 w-5" />
          {active.length > 0 && <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[11px] font-bold text-white">{active.length}</span>}
        </button>
      </div>
      {active.length > 0 && (
        <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
          {active.map((k) => (
            <button key={k} onClick={() => set(k, '')} className="chip">{k === 'available' ? t('Available') : params.get(k).slice(0, 24)}<X className="h-3.5 w-3.5" /></button>
          ))}
          <button onClick={reset} className="chip text-muted"><RotateCcw className="h-3.5 w-3.5" />{t('Clear all')}</button>
        </div>
      )}
      <div className="mt-6 grid gap-8 lg:grid-cols-[260px_1fr]">
        <aside className="hidden lg:block">{panel}</aside>
        <div>
          <ErrorNote error={error} />
          {res && <p className="mb-4 text-sm text-muted">{t('{n} concerts', { n: res.total })}</p>}
          {!res ? <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3"><SkeletonCards n={6} /></div>
            : res.items.length ? <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{res.items.map((c, i) => <Reveal key={c.id} delay={(i % 3) * 70}><ConcertCard c={c} /></Reveal>)}</div>
            : <Empty icon={Ticket} title={t('No concerts match')}>{t('Try removing a filter, or check back soon — new concerts are added regularly.')}</Empty>}
        </div>
      </div>
      {open && createPortal(<FilterSheet onClose={() => setOpen(false)} onReset={reset} count={active.length} total={res?.total}>{panel}</FilterSheet>, document.body)}
    </div>
  )
}

function Sel({ label, value, onChange, options }) {
  const { t } = useT()
  return (
    <label className="block min-w-0">
      <span className="label">{label}</span>
      <span className="relative block">
        <select className={cls('input h-12 appearance-none pr-10', value && 'border-accent/50 font-semibold')} value={value || ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">{t('All')}</option>
          {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      </span>
    </label>
  )
}

function FilterSheet({ children, onClose, onReset, count, total }) {
  const { t } = useT()
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const k = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', k) }
  }, [onClose])
  return (
    <div className="fixed inset-0 z-[95] lg:hidden" role="dialog" aria-modal="true" aria-label={t('Filters')}>
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" style={{ animation: 'fade-in .2s ease' }} onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col rounded-t-[28px] border-t border-line bg-bg shadow-lift"
        style={{ animation: 'sheet-up .3s cubic-bezier(.2,.8,.2,1)' }}>
        <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-line" />
        <div className="flex shrink-0 items-center justify-between px-5 pb-3 pt-3">
          <button onClick={onReset} disabled={!count} className="text-sm font-semibold text-accent disabled:text-muted/50">{t('Reset')}</button>
          <p className="font-display text-lg font-bold">{t('Filters')}{count > 0 && <span className="ml-1.5 text-muted">· {count}</span>}</p>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-raised" aria-label={t('Close')}><X className="h-4 w-4" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">{children}</div>
        <div className="shrink-0 border-t border-line bg-bg/95 px-5 pb-[calc(14px+var(--safe-bottom))] pt-3 backdrop-blur">
          <button className="btn-holo w-full py-3.5 text-[15px]" onClick={onClose}>
            {total === undefined ? t('Show results') : total === 1 ? t('Show 1 concert') : t('Show {n} concerts', { n: total })}
          </button>
        </div>
      </div>
    </div>
  )
}

export function Artists() {
  usePageMeta({ title: 'K-pop artists', description: 'K-pop artists with upcoming concerts and resale tickets on TicketNest.' })
  const { t } = useT()
  const [rows, setRows] = useState(null)
  const [q, setQ] = useState('')
  useEffect(() => { api('/api/artists').then(setRows).catch(() => setRows([])) }, [])
  const shown = (rows || []).filter((a) => a.name.toLowerCase().includes(q.toLowerCase()))
  return (
    <div className="page pt-10">
      <h1 className="rise text-4xl font-bold">{t('Artists')}</h1>
      <input className="input mt-5 max-w-sm" placeholder={t('Find an artist')} value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="mt-8 grid grid-cols-3 gap-6 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7">
        {shown.map((a) => <div key={a.id} className="flex flex-col items-center"><ArtistTile a={a} /><span className="mt-1 text-[12px] text-muted">{a.upcoming_concerts ? t('{n} upcoming', { n: a.upcoming_concerts }) : t('No dates yet')}</span></div>)}
      </div>
    </div>
  )
}
