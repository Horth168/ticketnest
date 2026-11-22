// Animated concert stage for the homepage hero: sweeping spotlights, rig lights, a crowd waving
// lightsticks and drifting confetti. Pure SVG + CSS (no video download), so it stays smooth on phones
// and stops moving for people who turn on "reduce motion".
import { useMemo } from 'react'

const STICK_COLORS = ['#A897FF', '#FF6FB5', '#5CE1E6', '#FFD166', '#FF8A5B', '#7CF29C']

function seeded(n) {
  let s = 7
  return Array.from({ length: n }, () => { s = (s * 9301 + 49297) % 233280; return s / 233280 })
}

export default function LiveStage({ className = '' }) {
  const sticks = useMemo(() => {
    const r = seeded(80)
    return Array.from({ length: 26 }, (_, i) => ({
      x: 30 + i * 46 + r[i] * 18, y: 430 + r[i + 26] * 38, color: STICK_COLORS[i % STICK_COLORS.length],
      delay: -(r[i + 52] * 2.2).toFixed(2), h: 34 + r[i + 10] * 14,
    }))
  }, [])
  const confetti = useMemo(() => {
    const r = seeded(120)
    return Array.from({ length: 22 }, (_, i) => ({
      left: `${(r[i] * 100).toFixed(1)}%`, size: 3 + r[i + 22] * 5, dur: 12 + r[i + 44] * 14,
      delay: -(r[i + 66] * 20).toFixed(1), color: STICK_COLORS[i % STICK_COLORS.length], round: i % 3 === 0,
    }))
  }, [])
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden>
      {/* night sky + stage glow */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_0%,#2A1B5E_0%,#120C2C_45%,#07060F_100%)]" />
      <div className="glow absolute left-1/2 top-[-20%] h-[70%] w-[70%] -translate-x-1/2 rounded-full bg-[#6D4BFF]/30 blur-[90px]" />
      <div className="glow absolute bottom-[10%] left-[10%] h-[40%] w-[35%] rounded-full bg-[#FF6FB5]/15 blur-[90px]" style={{ animationDelay: '-2s' }} />
      <div className="glow absolute bottom-[12%] right-[8%] h-[40%] w-[35%] rounded-full bg-[#5CE1E6]/12 blur-[90px]" style={{ animationDelay: '-3.5s' }} />

      <svg viewBox="0 0 1200 520" preserveAspectRatio="xMidYMid slice" className="stage-hue absolute inset-0 h-full w-full">
        <defs>
          {['#B9A8FF', '#FF8CC6', '#7DEBEF'].map((c, i) => (
            <linearGradient key={c} id={`beam${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={c} stopOpacity=".75" /><stop offset=".7" stopColor={c} stopOpacity=".08" /><stop offset="1" stopColor={c} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {/* moving heads on the rig */}
        {[[150, 'beam-a', 0], [370, 'beam-b', 1], [600, 'beam-c', 2], [830, 'beam-b', 0], [1050, 'beam-a', 1]].map(([x, cls, g], i) => (
          <g key={x} transform={`translate(${x} 8)`}>
            <polygon className={`beam ${cls}`} style={{ animationDelay: `${-i * 1.3}s` }}
              points="-7,0 7,0 130,560 -130,560" fill={`url(#beam${g})`} opacity=".55" />
          </g>
        ))}
        {/* truss + rig lights */}
        <rect x="0" y="0" width="1200" height="8" fill="#1B1535" />
        <rect x="0" y="7" width="1200" height="2" fill="#6D4BFF" opacity=".9" />
        {Array.from({ length: 13 }, (_, i) => (
          <circle key={i} className="twinkle" style={{ animationDelay: `${-(i * 0.37) % 2.4}s` }}
            cx={45 + i * 92} cy="16" r="4.5" fill={i % 3 === 0 ? '#FFD166' : '#FFFFFF'} />
        ))}
        {/* crowd */}
        <path d="M0 520 V445 Q25 420 50 438 Q72 400 100 428 Q128 392 158 424 Q186 404 214 432 Q240 384 272 420 Q300 402 330 434 Q356 390 388 424 Q416 404 446 436 Q474 388 506 422 Q534 400 564 430 Q594 382 628 420 Q656 404 686 434 Q714 390 746 424 Q776 402 806 434 Q836 386 868 420 Q896 402 926 432 Q956 390 988 424 Q1016 404 1046 434 Q1076 394 1108 426 Q1136 404 1166 432 Q1184 420 1200 438 V520Z" fill="#05040C" />
        {/* waving lightsticks */}
        {sticks.map((s, i) => (
          <g key={i} className="lightstick" style={{ animationDelay: `${s.delay}s` }}>
            <rect x={s.x - 1.5} y={s.y - s.h} width="3" height={s.h} rx="1.5" fill="#0B0A14" />
            <circle cx={s.x} cy={s.y - s.h} r="9" fill={s.color} opacity=".28" />
            <circle cx={s.x} cy={s.y - s.h} r="4.5" fill={s.color} />
          </g>
        ))}
      </svg>
      {/* confetti */}
      {confetti.map((c, i) => (
        <span key={i} className="confetti absolute bottom-[-10px]"
          style={{ left: c.left, width: c.size, height: c.round ? c.size : c.size * 2.2, background: c.color, opacity: 0.7,
            borderRadius: c.round ? 999 : 2, animationDuration: `${c.dur}s`, animationDelay: `${c.delay}s` }} />
      ))}
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/40 to-transparent" />
    </div>
  )
}
