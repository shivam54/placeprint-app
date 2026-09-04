import { useState } from 'react'
import type { DnaItem } from './api'
import type { Lang } from './i18n'
import { t } from './i18n'
import { bucketIncludes, bucketLabel } from './labels'

type Props = {
  dna: DnaItem[]
  activeId: string | null
  lang: Lang
  onSelect: (id: string) => void
}

export function DnaRadar({ dna, activeId, lang, onSelect }: Props) {
  const copy = t(lang)
  const items = dna.filter((d) => d.count > 0)
  const n = Math.max(items.length, 3)
  const cx = 110
  const cy = 110
  const r = items.length > 14 ? 72 : items.length > 10 ? 78 : 84
  const [hoverId, setHoverId] = useState<string | null>(null)

  const pts = items.map((d, i) => {
    const ang = -Math.PI / 2 + (i / n) * Math.PI * 2
    const maxShare = Math.max(...items.map((x) => x.share), 0.01)
    const rr = r * Math.min(Math.max((d.share / maxShare) * 0.9, 0.14), 1)
    return {
      x: cx + Math.cos(ang) * rr,
      y: cy + Math.sin(ang) * rr,
      lx: cx + Math.cos(ang) * (r + 20),
      ly: cy + Math.sin(ang) * (r + 20),
      tipX: cx + Math.cos(ang) * r,
      tipY: cy + Math.sin(ang) * r,
      d,
    }
  })

  const poly = pts.map((p) => `${p.x},${p.y}`).join(' ')
  const rings = [0.25, 0.5, 0.75, 1]
  const hovered = pts.find((p) => p.d.id === hoverId)?.d ?? null
  const canvas = 220
  const pad = 36
  const hoveredLabel = bucketLabel(hovered, lang)
  const hoveredIncludes = bucketIncludes(hovered, lang)

  return (
    <div className="radar-wrap">
      <svg
        viewBox={`${-pad} ${-pad} ${canvas + pad * 2} ${canvas + pad * 2}`}
        className="radar"
        role="img"
        aria-label={copy.dna}
      >
        {rings.map((s) => (
          <circle key={s} cx={cx} cy={cy} r={r * s} className="radar-ring" />
        ))}
        {pts.map((p, i) => (
          <line
            key={`a-${i}`}
            x1={cx}
            y1={cy}
            x2={p.tipX}
            y2={p.tipY}
            className="radar-axis"
          />
        ))}
        {pts.length > 2 && <polygon points={poly} className="radar-poly" />}
        {pts.map((p) => {
          const active = activeId === p.d.id
          const hovering = hoverId === p.d.id
          const name = bucketLabel(p.d, lang)
          return (
            <g
              key={p.d.id}
              className={active ? 'radar-hit on' : 'radar-hit'}
              onClick={() => onSelect(p.d.id)}
              onMouseEnter={() => setHoverId(p.d.id)}
              onMouseLeave={() => setHoverId(null)}
              role="button"
              tabIndex={0}
              aria-label={`${name}, ${p.d.count} ${copy.dnaPlaces}`}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelect(p.d.id)
                }
              }}
            >
              <circle cx={p.tipX} cy={p.tipY} r={20} className="radar-hitbox" />
              <circle
                cx={p.x}
                cy={p.y}
                r={active || hovering ? 7 : 4}
                className={active ? 'radar-dot on' : hovering ? 'radar-dot hot' : 'radar-dot'}
              />
              <text x={p.lx} y={p.ly} className="radar-label">
                {p.d.emoji}
              </text>
            </g>
          )
        })}
      </svg>
      <div className={`radar-tip${hovered ? ' show' : ''}`} aria-live="polite">
        {hovered ? (
          <>
            <strong>
              {hovered.emoji} {hoveredLabel}
            </strong>
            <span>
              {hovered.count} {copy.dnaPlaces} · {Math.round(hovered.share * 100)}%
              {hoveredIncludes ? ` · ${hoveredIncludes}` : ''}
            </span>
          </>
        ) : (
          <span>{copy.dnaHover}</span>
        )}
      </div>
    </div>
  )
}
