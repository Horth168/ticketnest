import { usePageMeta } from '../lib/seo'
import { SlidersHorizontal, Ticket, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
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

  const panel = (
    <div className="space-y-4">
      <Sel label={t('Artist')} value={params.get('artist')} onChange={(v) => set('artist', v)} options={(filters?.artists || []).map((a) => [a.slug, a.name])} />
      <Sel label={t('Country')} value={params.get('country')} onChange={(v) => set('country', v)} options={(filters?.countries || []).map((c) => [c, c])} />
      <Sel label={t('City')} value={params.get('city')} onChange={(v) => set('city', v)} options={cities.map((c) => [c.city, c.city])} />
      <Sel label={t('Venue')} value={params.get('venue')} onChange={(v) => set('venue', v)} options={(filters?.venues || []).map((c) => [c, c])} />
      <Sel label={t('Ticket category')} value={params.get('category')} onChange={(v) => set('category', v)} options={(filters?.categories || []).map((c) => [c, c])} />
      <div className="grid grid-cols-2 gap-2">
        <label><span className="label">{t('From')}</span><input type="date" className="input" value={params.get('date_from')?.slice(0, 10) || ''} onChange={(e) => set('date_from', e.target.value)} /></label>
        <label><span className="label">{t('To')}</span><input type="date" className="input" value={params.get('date_to')?.slice(0, 10) || ''} onChange={(e) => set('date_to', e.target.value ? `${e.target.value}T23:59:59` : '')} /></label>
      </div>
      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-3 text-sm font-medium">
        <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--accent))]" checked={!!params.get('available')} onChange={(e) => set('available', e.target.checked ? '1' : '')} />
        {t('Only concerts with tickets available')}
      </label>
    </div>
  )

  return (
    <div className={cls('page', compact ? 'pt-4' : 'pt-10')}>
      {!compact && <h1 className="rise text-4xl font-bold">{t('Explore concerts')}</h1>}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <input className="input max-w-md flex-1" placeholder={t('Search artist, concert, city or venue')} defaultValue={params.get('q') || ''}
          onKeyDown={(e) => e.key === 'Enter' && set('q', e.currentTarget.value.trim())} onBlur={(e) => set('q', e.currentTarget.value.trim())} aria-label="Search" />
        <button className="btn-ghost lg:hidden" onClick={() => setOpen(true)}><SlidersHorizontal className="h-4 w-4" />{t('Filters')}{active.length ? ` (${active.length})` : ''}</button>
        {active.map((k) => (
          <button key={k} onClick={() => set(k, '')} className="chip">{k === 'available' ? t('Available') : params.get(k).slice(0, 24)}<X className="h-3.5 w-3.5" /></button>
        ))}
      </div>
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
      {open && (
        <div className="fixed inset-0 z-[80] flex items-end bg-black/50 lg:hidden" onClick={() => setOpen(false)}>
          <div className="rise max-h-[85vh] w-full overflow-auto rounded-t-3xl bg-bg p-5 pb-[calc(20px+var(--safe-bottom))]" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between"><p className="text-lg font-semibold">{t('Filters')}</p><button onClick={() => setOpen(false)} aria-label="Close"><X className="h-5 w-5" /></button></div>
            {panel}
            <button className="btn-primary mt-5 w-full py-3" onClick={() => setOpen(false)}>{t('Show {n} results', { n: res?.total ?? '' })}</button>
          </div>
        </div>
      )}
    </div>
  )
}

function Sel({ label, value, onChange, options }) {
  const { t } = useT()
  return (
    <label className="block">
      <span className="label">{label}</span>
      <select className="input" value={value || ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">{t('All')}</option>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
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
