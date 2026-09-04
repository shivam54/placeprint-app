import { useEffect, useState } from 'react'
import { fetchSummary, type Analysis, type BlockSummary } from './api'
import type { Lang } from './i18n'
import { t } from './i18n'

type Props = {
  lang: Lang
  analysis: Analysis
  placeName: string
}

const DEBOUNCE_MS = 450

export function BlockBrief({ lang, analysis, placeName }: Props) {
  const copy = t(lang)
  const [brief, setBrief] = useState<BlockSummary | null>(null)

  useEffect(() => {
    let cancelled = false
    setBrief(null)
    const timer = window.setTimeout(() => {
      fetchSummary({ analysis, place_name: placeName, lang }).then((data) => {
        if (!cancelled) setBrief(data)
      })
    }, DEBOUNCE_MS)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    placeName,
    lang,
    analysis.center.lon,
    analysis.center.lat,
    analysis.radius_m,
    analysis.place_count,
    analysis.personality,
  ])

  return (
    <section className={`block-brief${brief ? '' : ' pulse-soft'}`}>
      <p className="block-brief-line">
        {brief?.line ?? copy.summaryLoading}
      </p>
    </section>
  )
}
