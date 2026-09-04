import { useEffect, useMemo, useState } from 'react'
import type { Lang } from './i18n'

/** Static sample shape for the welcome intro - not live analysis. */
const DEMO_DNA = [
  { id: 'restaurants', emoji: '🍜', label: 'Restaurants', label_es: 'Restaurantes', share: 0.22 },
  { id: 'shops', emoji: '🛍️', label: 'Shops', label_es: 'Tiendas', share: 0.14 },
  { id: 'clinics', emoji: '🏥', label: 'Clinics', label_es: 'Clínicas', share: 0.06 },
  { id: 'groceries', emoji: '🛒', label: 'Groceries', label_es: 'Compras', share: 0.05 },
  { id: 'parks', emoji: '🌳', label: 'Parks', label_es: 'Parques', share: 0.04 },
  { id: 'dentists', emoji: '🦷', label: 'Dentists', label_es: 'Dentistas', share: 0.03 },
  { id: 'clothing', emoji: '👕', label: 'Clothing', label_es: 'Ropa', share: 0.04 },
  { id: 'gyms', emoji: '🏋️', label: 'Gyms', label_es: 'Gimnasios', share: 0.03 },
  { id: 'outdoors', emoji: '🥾', label: 'Outdoors', label_es: 'Aire libre', share: 0.05 },
  { id: 'bars', emoji: '🍸', label: 'Bars', label_es: 'Bares', share: 0.07 },
  { id: 'cafes', emoji: '☕', label: 'Cafes', label_es: 'Cafés', share: 0.09 },
  { id: 'bakeries', emoji: '🥐', label: 'Bakeries', label_es: 'Panaderías', share: 0.04 },
  { id: 'studios', emoji: '🧘', label: 'Studios', label_es: 'Estudios', share: 0.03 },
  { id: 'playgrounds', emoji: '🛝', label: 'Playgrounds', label_es: 'Parques infantiles', share: 0.02 },
  { id: 'theatres', emoji: '🎭', label: 'Theatres', label_es: 'Teatros', share: 0.11 },
  { id: 'pharmacies', emoji: '💊', label: 'Pharmacies', label_es: 'Farmacias', share: 0.02 },
]

/** Decorative block-DNA radar for the welcome carousel (dark theme, gently animated). */
export function IntroDnaPreview({ lang = 'en' }: { lang?: Lang }) {
  const [tick, setTick] = useState(0)
  const [hot, setHot] = useState(0)
  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    if (reduced) return
    let raf = 0
    let start = 0
    const loop = (t: number) => {
      if (!start) start = t
      const elapsed = t - start
      setTick(elapsed / 1000)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    const hotTimer = window.setInterval(() => {
      setHot((h) => (h + 1) % DEMO_DNA.length)
    }, 900)
    return () => {
      cancelAnimationFrame(raf)
      window.clearInterval(hotTimer)
    }
  }, [reduced])

  const items = useMemo(() => {
    return DEMO_DNA.map((d, i) => {
      // Soft breathing morph - looks “live” without changing meaning
      const wave = Math.sin(tick * 1.15 + i * 0.55) * 0.018 + Math.sin(tick * 0.4 + i) * 0.01
      return { ...d, share: Math.max(0.015, d.share + wave) }
    })
  }, [tick])

  const n = items.length
  const cx = 110
  const cy = 110
  const r = 72
  const maxShare = Math.max(...items.map((x) => x.share), 0.01)

  const pts = items.map((d, i) => {
    const ang = -Math.PI / 2 + (i / n) * Math.PI * 2
    const rr = r * Math.min(Math.max((d.share / maxShare) * 0.92, 0.12), 1)
    return {
      x: cx + Math.cos(ang) * rr,
      y: cy + Math.sin(ang) * rr,
      lx: cx + Math.cos(ang) * (r + 18),
      ly: cy + Math.sin(ang) * (r + 18),
      tipX: cx + Math.cos(ang) * r,
      tipY: cy + Math.sin(ang) * r,
      d,
      i,
    }
  })

  const poly = pts.map((p) => `${p.x},${p.y}`).join(' ')
  const rings = [0.25, 0.5, 0.75, 1]
  const canvas = 220
  const pad = 34
  const hotLabel = items[hot]

  return (
    <div className="intro-dna" aria-hidden>
      <svg
        viewBox={`${-pad} ${-pad} ${canvas + pad * 2} ${canvas + pad * 2}`}
        className="intro-dna__svg"
      >
        {rings.map((s) => (
          <circle key={s} cx={cx} cy={cy} r={r * s} className="intro-dna__ring" />
        ))}
        {pts.map((p, i) => (
          <line
            key={`a-${i}`}
            x1={cx}
            y1={cy}
            x2={p.tipX}
            y2={p.tipY}
            className="intro-dna__axis"
          />
        ))}
        <polygon points={poly} className="intro-dna__poly" />
        {pts.map((p) => {
          const isHot = p.i === hot && !reduced
          return (
            <g key={p.d.id}>
              <circle
                cx={p.x}
                cy={p.y}
                r={isHot ? 5.5 : 3.5}
                className={isHot ? 'intro-dna__dot is-hot' : 'intro-dna__dot'}
              />
              <text
                x={p.lx}
                y={p.ly}
                className={isHot ? 'intro-dna__label is-hot' : 'intro-dna__label'}
              >
                {p.d.emoji}
              </text>
            </g>
          )
        })}
      </svg>
      <p className="intro-dna__caption">
        <span>
          {hotLabel.emoji}{' '}
          {lang === 'es' ? hotLabel.label_es : hotLabel.label}
        </span>
      </p>
    </div>
  )
}
