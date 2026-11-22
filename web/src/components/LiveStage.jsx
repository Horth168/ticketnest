// Hero background that reads like a live concert shot through a fast lens: soft volumetric light
// cutting through haze, out-of-focus crowd lights (bokeh) drifting and shimmering, a warm stage
// flare, film grain and a vignette. No cartoon shapes and no video download: the bokeh is drawn on a
// small canvas (capped DPR, ~30 fps, paused off-screen / in background tabs / for "reduce motion").
import { useEffect, useRef } from 'react'

// warm whites dominate, like phone lights and lightsticks in a dark arena, with a few brand tints
const PALETTE = [[255, 236, 214], [255, 244, 230], [255, 226, 196], [198, 184, 255], [255, 160, 205], [150, 226, 240]]
const WEIGHTS = [0.3, 0.24, 0.16, 0.14, 0.09, 0.07]

function pick(r) {
  let acc = 0
  for (let i = 0; i < WEIGHTS.length; i++) { acc += WEIGHTS[i]; if (r <= acc) return i }
  return 0
}

function sprite([r, g, b], soft) {
  const s = 64, c = document.createElement('canvas')
  c.width = c.height = s
  const x = c.getContext('2d'), gr = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
  // sharp-ish disc for near lights, very soft blob for far ones (a lens renders both)
  gr.addColorStop(0, `rgba(${r},${g},${b},1)`)
  gr.addColorStop(soft ? 0.15 : 0.55, `rgba(${r},${g},${b},${soft ? 0.55 : 0.9})`)
  gr.addColorStop(soft ? 0.6 : 0.8, `rgba(${r},${g},${b},${soft ? 0.12 : 0.35})`)
  gr.addColorStop(1, `rgba(${r},${g},${b},0)`)
  x.fillStyle = gr
  x.fillRect(0, 0, s, s)
  return c
}

function Bokeh() {
  const ref = useRef(null)
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas.getContext('2d')
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const sprites = PALETTE.map((p) => [sprite(p, false), sprite(p, true)])
    let w = 0, h = 0, dots = [], raf = 0, last = 0, visible = true

    const build = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      w = canvas.clientWidth; h = canvas.clientHeight
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const n = Math.round(Math.min(150, Math.max(60, (w * h) / 9000)))
      let seed = 11
      const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
      dots = Array.from({ length: n }, () => {
        const depth = rnd()                          // 0 = far back, 1 = close to the lens
        const y = h * (0.42 + Math.pow(rnd(), 0.7) * 0.62)   // crowd sits in the lower part of the frame
        return {
          x: rnd() * w, y, depth, color: pick(rnd()),
          r: 2 + depth * depth * 26 + rnd() * 3,
          a: 0.18 + (1 - depth) * 0.35 + rnd() * 0.25,
          tw: 0.4 + rnd() * 1.6, ph: rnd() * Math.PI * 2,          // shimmer speed / phase
          sw: 4 + depth * 14, sp: 0.15 + rnd() * 0.35,               // sway distance / speed
          vy: -(0.6 + rnd() * 2.2) * (0.3 + depth),                  // slow upward float (px/s)
        }
      })
    }

    const draw = (t) => {
      ctx.clearRect(0, 0, w, h)
      ctx.globalCompositeOperation = 'lighter'
      const s = t / 1000
      for (const d of dots) {
        const y = still ? d.y : ((d.y + d.vy * s) % (h * 1.08) + h * 1.08) % (h * 1.08)
        const top = h * 0.36
        const fade = y < top ? 0 : Math.min(1, (y - top) / (h * 0.18))
        if (fade <= 0) continue
        const x = d.x + (still ? 0 : Math.sin(s * d.sp + d.ph) * d.sw)
        const shimmer = still ? 0.85 : 0.6 + 0.4 * Math.sin(s * d.tw + d.ph)
        ctx.globalAlpha = Math.max(0, d.a * shimmer * fade)
        const size = d.r * 2
        ctx.drawImage(sprites[d.color][d.depth < 0.45 ? 1 : 0], x - d.r, y - d.r, size, size)
      }
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
    }

    const loop = (t) => {
      raf = requestAnimationFrame(loop)
      if (!visible || document.hidden || t - last < 33) return
      last = t
      draw(t)
    }

    build()
    if (still) draw(0)
    else raf = requestAnimationFrame(loop)
    const ro = new ResizeObserver(() => { build(); if (still) draw(0) })
    ro.observe(canvas)
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting })
    io.observe(canvas)
    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect() }
  }, [])
  return <canvas ref={ref} className="absolute inset-0 h-full w-full" />
}

const GRAIN = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .55 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")"

export default function LiveStage({ className = '' }) {
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden bg-[#06050B] ${className}`} aria-hidden>
      {/* arena darkness with a faint violet stage wash */}
      <div className="absolute inset-0 bg-[radial-gradient(90%_70%_at_50%_-10%,#2B1E5C_0%,#140F2B_42%,#06050B_78%)]" />

      {/* volumetric light through haze: wide, blurred shafts that sweep slowly from the rig */}
      <div className="absolute inset-x-0 top-0 h-full mix-blend-screen">
        {[
          ['18%', 'rgba(196,181,255,.55)', 'haze-a', '-4s'],
          ['38%', 'rgba(255,214,236,.38)', 'haze-b', '-9s'],
          ['62%', 'rgba(170,230,255,.40)', 'haze-a', '-13s'],
          ['82%', 'rgba(196,181,255,.50)', 'haze-b', '-2s'],
        ].map(([left, c, anim, delay]) => (
          <div key={left} className={`haze-beam ${anim}`} style={{ left, animationDelay: delay }}>
            <i style={{ background: `linear-gradient(to bottom, ${c} 0%, ${c.replace(/[\d.]+\)$/, '.12)')} 45%, transparent 85%)` }} />
          </div>
        ))}
      </div>

      {/* rolling haze */}
      <div className="haze-drift absolute -inset-x-1/4 top-[18%] h-[60%] bg-[radial-gradient(50%_50%_at_30%_50%,rgba(140,110,255,.16),transparent_70%),radial-gradient(45%_45%_at_75%_55%,rgba(255,140,200,.10),transparent_70%)] blur-2xl" />

      {/* stage flare: warm source light at the top of the frame */}
      <div className="flare absolute left-1/2 top-[-140px] h-[320px] w-[520px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(255,240,225,.55),rgba(186,160,255,.18)_55%,transparent)] blur-xl" />

      <Bokeh />

      {/* lens finish: grain, vignette, fade into the page */}
      <div className="absolute inset-0 opacity-[.07] mix-blend-overlay" style={{ backgroundImage: GRAIN }} />
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_40%,transparent_55%,rgba(0,0,0,.6)_100%)]" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/45 via-black/10 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/50 to-transparent" />
    </div>
  )
}
