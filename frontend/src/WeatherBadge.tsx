import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { fetchWeather, type PinWeather } from './api'
import type { Lang } from './i18n'

type Props = {
  lat: number
  lon: number
  lang: Lang
  eyebrow: string
  panelEl: HTMLElement | null
}

function AuraEffects({ mood }: { mood: string }) {
  if (mood === 'clear' || mood === 'partly') {
    return (
      <>
        <span className="wx-sky-wash" />
        <span className="wx-sun-bloom" />
        <span className="wx-sun-core" />
        <span className="wx-sun-spike wx-sun-spike--h" />
        <span className="wx-sun-spike wx-sun-spike--v" />
        <span className="wx-sun-spike wx-sun-spike--d1" />
        <span className="wx-sun-spike wx-sun-spike--d2" />
        <span className="wx-flare wx-flare--1" />
        <span className="wx-flare wx-flare--2" />
        <span className="wx-flare wx-flare--3" />
        <span className="wx-flare wx-flare--4" />
        <span className="wx-ray-sheet" />
        {mood === 'partly' && (
          <>
            <span className="wx-drift-cloud wx-drift-cloud--a" />
            <span className="wx-drift-cloud wx-drift-cloud--b" />
          </>
        )}
      </>
    )
  }
  if (mood === 'night') {
    return (
      <>
        <span className="wx-sky-wash" />
        <span className="wx-moon-bloom" />
        <span className="wx-moon-core" />
        <span className="wx-star wx-star--1" />
        <span className="wx-star wx-star--2" />
        <span className="wx-star wx-star--3" />
        <span className="wx-star wx-star--4" />
        <span className="wx-flare wx-flare--night1" />
        <span className="wx-flare wx-flare--night2" />
      </>
    )
  }
  if (mood === 'fog') {
    return (
      <>
        <span className="wx-sky-wash" />
        <span className="wx-fog-band wx-fog-band--1" />
        <span className="wx-fog-band wx-fog-band--2" />
        <span className="wx-fog-band wx-fog-band--3" />
      </>
    )
  }
  if (mood === 'rain' || mood === 'storm') {
    return (
      <>
        <span className="wx-sky-wash" />
        <span className="wx-drift-cloud wx-drift-cloud--dark" />
        {mood === 'storm' && <span className="wx-flash" />}
        {Array.from({ length: 14 }, (_, i) => (
          <span key={i} className={`wx-raindrop wx-raindrop--${i + 1}`} />
        ))}
      </>
    )
  }
  if (mood === 'snow') {
    return (
      <>
        <span className="wx-sky-wash" />
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} className={`wx-snowflake wx-snowflake--${i + 1}`} />
        ))}
      </>
    )
  }
  return (
    <>
      <span className="wx-sky-wash" />
      <span className="wx-drift-cloud wx-drift-cloud--a" />
      <span className="wx-drift-cloud wx-drift-cloud--b" />
      <span className="wx-drift-cloud wx-drift-cloud--c" />
    </>
  )
}

export function WeatherBadge({ lat, lon, lang, eyebrow, panelEl }: Props) {
  const [wx, setWx] = useState<PinWeather | null>(null)

  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(() => {
      fetchWeather(lat, lon, lang)
        .then((data) => {
          if (!cancelled) setWx(data)
        })
        .catch(() => {
          if (!cancelled) setWx(null)
        })
    }, 350)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [lat, lon, lang])

  const mood = wx?.mood || 'idle'
  const temp = wx ? Math.round(wx.temp_f) : null
  const condition = wx?.condition

  const aura =
    wx && panelEl
      ? createPortal(
          <div className={`wx-aura wx-aura--${mood}`} aria-hidden>
            <AuraEffects mood={mood} />
          </div>,
          panelEl,
        )
      : null

  return (
    <>
      {aura}
      <div
        className={`wx-band wx-band--${mood}`}
        role={wx ? 'status' : undefined}
        aria-label={wx ? `${condition}, ${temp}°F` : undefined}
      >
        <p className="eyebrow">{eyebrow}</p>
        {wx && (
          <p className="wx-reading">
            <strong>{temp}°</strong>
            <span>{condition}</span>
          </p>
        )}
      </div>
    </>
  )
}
