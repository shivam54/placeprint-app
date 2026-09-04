import { useEffect, useRef, useState } from 'react'

const STORAGE_KEY = 'placeprint-scout-fab'

type Pos = { x: number; y: number }

function loadPos(): Pos | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as Pos
    if (typeof p.x === 'number' && typeof p.y === 'number') return p
  } catch {
    /* ignore */
  }
  return null
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function defaultPos(): Pos {
  const w = typeof window !== 'undefined' ? window.innerWidth : 1200
  const h = typeof window !== 'undefined' ? window.innerHeight : 800
  const panel = Math.min(420, w)
  // Sit above map attribution, left of the side panel
  return {
    x: clamp(w - panel - 100, 16, w - 100),
    y: clamp(h - 96, 16, h - 64),
  }
}

type Props = {
  label: string
  hint?: string
  onOpen: () => void
}

/** Floating Scout button - click to open, drag to move (stays clear of attribution). */
export function ScoutFab({ label, hint, onOpen }: Props) {
  const [pos, setPos] = useState<Pos>(() => loadPos() ?? defaultPos())
  const drag = useRef<{
    pointerId: number
    startX: number
    startY: number
    origX: number
    origY: number
    moved: boolean
  } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const onResize = () => {
      setPos((p) => {
        const w = window.innerWidth
        const h = window.innerHeight
        const el = btnRef.current
        const bw = el?.offsetWidth ?? 88
        const bh = el?.offsetHeight ?? 48
        return {
          x: clamp(p.x, 12, w - bw - 12),
          y: clamp(p.y, 12, h - bh - 12),
        }
      })
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    const el = btnRef.current
    el?.setPointerCapture(e.pointerId)
    drag.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origX: pos.x,
      origY: pos.y,
      moved: false,
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || d.pointerId !== e.pointerId) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    if (!d.moved && Math.hypot(dx, dy) < 6) return
    d.moved = true
    const el = btnRef.current
    const bw = el?.offsetWidth ?? 88
    const bh = el?.offsetHeight ?? 48
    const next = {
      x: clamp(d.origX + dx, 12, window.innerWidth - bw - 12),
      y: clamp(d.origY + dy, 12, window.innerHeight - bh - 12),
    }
    setPos(next)
  }

  const endDrag = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || d.pointerId !== e.pointerId) return
    drag.current = null
    try {
      btnRef.current?.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    if (d.moved) {
      setPos((current) => {
        try {
          sessionStorage.setItem(STORAGE_KEY, JSON.stringify(current))
        } catch {
          /* ignore */
        }
        return current
      })
      return
    }
    onOpen()
  }

  return (
    <button
      ref={btnRef}
      type="button"
      className={`chat-fab${hint ? ' chat-fab--guided' : ''}`}
      style={{ left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' }}
      title="Drag to move · click to open Scout"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <span className="chat-fab-label">{label}</span>
      {hint ? <span className="chat-fab-hint">{hint}</span> : null}
    </button>
  )
}
