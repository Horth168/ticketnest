// Interactive seat map drawn in SVG (no venue images): a stage, floor standing pens and seating tiers
// around an oval, like the big stadium and arena shows in Singapore and Kuala Lumpur. Each ticket
// category owns some zones (set by admins); tapping a zone or a category highlights where those seats are.
import { useMemo, useState } from 'react'
import { useT } from '../i18n'
import { cls, usd } from '../lib/format'

export const CAT_COLORS = ['#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#06B6D4', '#3B82F6', '#F43F5E', '#84CC16']
export const LAYOUTS = { stadium: 'Stadium (pens + 2 tiers)', arena: 'Indoor arena (pens + 2 tiers, smaller)' }

const CX = 320, CY = 330
const GAP = [-125, -55]   // degrees behind the stage with no seats (0 = right, -90 = top)

function pt(rx, ry, deg) {
  const r = (deg * Math.PI) / 180
  return [CX + rx * Math.cos(r), CY + ry * Math.sin(r)]
}

function sector(r1, r2, a0, a1) {
  const [x0, y0] = pt(r2[0], r2[1], a0), [x1, y1] = pt(r2[0], r2[1], a1)
  const [x2, y2] = pt(r1[0], r1[1], a1), [x3, y3] = pt(r1[0], r1[1], a0)
  const large = a1 - a0 > 180 ? 1 : 0
  return `M${x0.toFixed(1)},${y0.toFixed(1)} A${r2[0]},${r2[1]} 0 ${large} 1 ${x1.toFixed(1)},${y1.toFixed(1)} `
    + `L${x2.toFixed(1)},${y2.toFixed(1)} A${r1[0]},${r1[1]} 0 ${large} 0 ${x3.toFixed(1)},${y3.toFixed(1)} Z`
}

function ring(prefix, n, r1, r2) {
  const start = GAP[1], span = 360 - (GAP[1] - GAP[0])
  return Array.from({ length: n }, (_, i) => {
    const a0 = start + (span * i) / n + 0.8, a1 = start + (span * (i + 1)) / n - 0.8
    const mid = (a0 + a1) / 2
    const [lx, ly] = pt((r1[0] + r2[0]) / 2, (r1[1] + r2[1]) / 2, mid)
    return { id: `${prefix}${i + 1}`, d: sector(r1, r2, a0, a1), lx, ly, label: `${prefix}${i + 1}` }
  })
}

function build(layout) {
  const arena = layout === 'arena'
  const pens = arena
    ? [['FA-L', 'A1', 222, 168, 96, 150], ['FA-R', 'A2', 322, 168, 96, 150]]
    : [['FA-L', 'A1', 220, 160, 98, 82], ['FA-R', 'A2', 322, 160, 98, 82], ['FB-L', 'B1', 220, 246, 98, 100], ['FB-R', 'B2', 322, 246, 98, 100]]
  const floor = pens.map(([id, label, x, y, w, h]) => ({ id, label, d: `M${x},${y} h${w} v${h} h${-w} Z`, lx: x + w / 2, ly: y + h / 2, floor: true }))
  const lower = arena ? ring('L', 10, [200, 200], [250, 240]) : ring('L', 12, [228, 214], [276, 256])
  const upper = arena ? ring('U', 12, [258, 248], [300, 290]) : ring('U', 14, [284, 264], [312, 298])
  return [...floor, ...lower, ...upper]
}

export function zonesFor(layout) {
  return layout ? build(layout).map((z) => z.id) : []
}

/**
 * categories: [{ id, name, zones: [], available, from_price_cents }]
 * selected: category id or null; onSelect(id|null)
 * editZones: admin mode -> onZone(zoneId) toggles the zone for the category being edited
 */
export default function SeatMap({ layout, categories, selected, onSelect, editColor, onZone, highlight = [], className = '' }) {
  const { t } = useT()
  const zones = useMemo(() => build(layout), [layout])
  const [hover, setHover] = useState(null)
  const owner = useMemo(() => {
    const m = {}
    categories.forEach((c, i) => (c.zones || []).forEach((z) => { m[z] = { cat: c, color: CAT_COLORS[i % CAT_COLORS.length] } }))
    return m
  }, [categories])
  if (!layout) return null
  const hoverInfo = hover && owner[hover]
  return (
    <div className={cls('relative', className)}>
      <svg viewBox="0 0 640 640" className="h-auto w-full select-none" role="img" aria-label={t('Seat map')}>
        <defs>
          <radialGradient id="sm-floor" cx="50%" cy="20%" r="80%"><stop offset="0%" stopColor="rgb(var(--accent))" stopOpacity=".16" /><stop offset="100%" stopColor="rgb(var(--accent))" stopOpacity="0" /></radialGradient>
          <linearGradient id="sm-stage" x1="0" x2="1"><stop offset="0%" stopColor="#7C5CFF" /><stop offset="55%" stopColor="#FF6EC7" /><stop offset="100%" stopColor="#7AE6FF" /></linearGradient>
          <pattern id="sm-sold" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="rgb(var(--line))" /><line x1="0" y1="0" x2="0" y2="6" stroke="rgb(var(--muted))" strokeOpacity=".35" strokeWidth="2" /></pattern>
        </defs>
        <ellipse cx={CX} cy={CY} rx="318" ry="304" fill="url(#sm-floor)" />
        {/* stage + catwalk */}
        <rect x="222" y="92" width="196" height="46" rx="10" fill="url(#sm-stage)" />
        <text x={CX} y="120" textAnchor="middle" className="fill-white text-[15px] font-bold tracking-[.3em]">{t('STAGE')}</text>
        <rect x="312" y="138" width="16" height={layout === 'arena' ? 26 : 18} fill="url(#sm-stage)" opacity=".8" />
        {zones.map((z) => {
          const o = owner[z.id]
          const dim = selected && (!o || o.cat.id !== selected)
          const soldOut = o && !onZone && o.cat.available === 0
          const lit = highlight.includes(z.id) || (selected && o && o.cat.id === selected)
          const fill = soldOut ? 'url(#sm-sold)' : o ? o.color : 'rgb(var(--line))'
          return (
            <g key={z.id} className={cls('transition-opacity duration-300', (o || onZone) && 'cursor-pointer')}
              opacity={dim ? 0.22 : 1}
              onMouseEnter={() => setHover(z.id)} onMouseLeave={() => setHover(null)}
              onClick={() => (onZone ? onZone(z.id) : o && onSelect?.(selected === o.cat.id ? null : o.cat.id))}>
              <path d={z.d} fill={fill} fillOpacity={o ? (lit ? 1 : 0.82) : 0.7}
                stroke={lit ? 'rgb(var(--ink))' : 'rgb(var(--bg))'} strokeWidth={lit ? 2.5 : 1.5}
                className={cls(lit && 'seat-pulse')} />
              <text x={z.lx} y={z.ly} textAnchor="middle" dominantBaseline="central" pointerEvents="none"
                className={cls('font-semibold', z.floor ? 'text-[15px]' : 'text-[10.5px]', o && !soldOut ? 'fill-white' : 'fill-muted')}>{z.label}</text>
            </g>
          )
        })}
        {onZone && editColor && <text x={CX} y="628" textAnchor="middle" className="fill-muted text-[13px]">{t('Tap zones to add or remove them')}</text>}
      </svg>
      {hoverInfo && !onZone && (
        <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-xl border border-line bg-surface/95 px-3 py-2 text-center text-[13px] shadow-lift backdrop-blur">
          <p className="font-semibold"><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: hoverInfo.color }} />{hoverInfo.cat.name} · {hover}</p>
          <p className="text-muted">{hoverInfo.cat.available ? `${t('from')} ${usd(hoverInfo.cat.from_price_cents)} · ${t('{n} left', { n: hoverInfo.cat.available })}` : t('Sold out')}</p>
        </div>
      )}
    </div>
  )
}
