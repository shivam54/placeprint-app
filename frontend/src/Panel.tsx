import { useState } from 'react'
import type { Analysis } from './api'
import { BlockBrief } from './BlockBrief'
import { DnaRadar } from './DnaRadar'
import type { Lang } from './i18n'
import { t } from './i18n'
import { bucketIncludes, bucketLabel } from './labels'
import { nearestNeighborhood } from './neighborhoods'

type Props = {
  lang: Lang
  analysis: Analysis | null
  loading: boolean
  error: string | null
  radiusM: number
  pinCenter: { lon: number; lat: number }
  activeBucket: string | null
  highlightCount: number
  locating: boolean
  startMode: 'explore' | 'location'
  onRadius: (m: number) => void
  onUseLocation: () => void
  onExploreSf: () => void
  onSelectSimilar: (lon: number, lat: number, rank?: number) => void
  onSelectBucket: (id: string) => void
  onOpenChat: () => void
  onToggleLang: () => void
}

export function Panel({
  lang,
  analysis,
  loading,
  error,
  radiusM,
  pinCenter,
  activeBucket,
  highlightCount,
  locating,
  startMode,
  onRadius,
  onUseLocation,
  onExploreSf,
  onSelectSimilar,
  onSelectBucket,
  onOpenChat,
  onToggleLang,
}: Props) {
  const copy = t(lang)
  const [howOpen, setHowOpen] = useState(false)
  const [startOpen, setStartOpen] = useState(true)

  const selected = analysis?.dna.find((d) => d.id === activeBucket) ?? null
  const pinLabel = nearestNeighborhood(pinCenter.lon, pinCenter.lat, lang)
  const placeName =
    analysis != null
      ? nearestNeighborhood(analysis.center.lon, analysis.center.lat, lang)
      : pinLabel

  return (
    <aside className="panel">
      <div className="panel-print" aria-hidden />

      <div className="topbar">
        <div className="topbar-actions">
          <button type="button" className="ghost-btn" onClick={onToggleLang}>
            {copy.lang}
          </button>
          <button type="button" className="ghost-btn" onClick={onOpenChat}>
            {copy.chatFab}
          </button>
        </div>
      </div>

      <header className="panel-hero">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1>{copy.title}</h1>
        <p className="lede">{copy.lede}</p>
      </header>

      <section className="how-box">
        <button
          type="button"
          className="collapse-toggle"
          onClick={() => setHowOpen((v) => !v)}
        >
          {copy.howTitle}
          <span className="collapse-caret">{howOpen ? '−' : '+'}</span>
        </button>
        {howOpen && (
          <ol className="how-list">
            <li>{copy.how1}</li>
            <li>{copy.how2}</li>
            <li>{copy.how3}</li>
          </ol>
        )}
      </section>

      <div className="pin-location pin-location--billboard">
        <span className="label">{copy.pinLocation}</span>
        <strong>{pinLabel}</strong>
      </div>

      {loading && <div className="status pulse">{copy.reading}</div>}
      {error && <div className="status error">{error}</div>}

      {analysis && !loading && (
        <BlockBrief lang={lang} analysis={analysis} placeName={placeName} />
      )}

      <section className="start-strip">
        <button
          type="button"
          className="collapse-toggle"
          onClick={() => setStartOpen((v) => !v)}
        >
          {copy.startHere}
          <span className="collapse-caret">{startOpen ? '−' : '+'}</span>
        </button>
        {startOpen && (
          <>
            <p className="section-hint">{copy.whereToLookHint}</p>
            <div className="hero-actions">
              <button
                type="button"
                className={startMode === 'explore' ? 'btn primary' : 'btn live'}
                onClick={onExploreSf}
              >
                {copy.exploreSf}
              </button>
              <button
                type="button"
                className={startMode === 'location' ? 'btn primary' : 'btn live'}
                onClick={onUseLocation}
                disabled={locating}
              >
                {locating ? copy.locating : copy.useLocation}
              </button>
            </div>
            <span className="hint">{copy.orClick}</span>
            <div className="control-block quiet-radius">
              <span className="label">
                {copy.walkingRadius} · ~{Math.round(radiusM / 80)} min · {Math.round(radiusM)}m
              </span>
              <input
                className="radius-range"
                type="range"
                min={400}
                max={1600}
                step={50}
                value={radiusM}
                onChange={(e) => onRadius(Number(e.target.value))}
              />
            </div>
          </>
        )}
      </section>

      {analysis && !loading && (
        <section className="dna-section">
          <div className="section-head">
            <h2>{copy.dna}</h2>
            <p className="section-hint">{copy.tapDna}</p>
          </div>
          <DnaRadar
            dna={analysis.dna}
            activeId={activeBucket}
            lang={lang}
            onSelect={onSelectBucket}
          />
          {selected && (
            <div className="dna-selected">
              <div className="dna-top">
                <span>
                  {selected.emoji} {bucketLabel(selected, lang)}
                </span>
                <strong>
                  {selected.count} · {Math.round(selected.share * 100)}%
                </strong>
              </div>
              {bucketIncludes(selected, lang) && (
                <p className="dna-includes">{bucketIncludes(selected, lang)}</p>
              )}
              <div className="bar">
                <span style={{ width: `${Math.max(selected.share * 100, 4)}%` }} />
              </div>
              <p className="filter-status">
                {copy.showingOnly} <strong>{bucketLabel(selected, lang)}</strong>
                {' · '}
                {highlightCount} {copy.onMap} · {copy.tapAgain}
              </p>
            </div>
          )}
        </section>
      )}

      {analysis && !loading && (
        <div className="results">
          <section>
            <div className="section-head">
              <h2>{copy.similar}</h2>
              <p className="section-hint">{copy.similarHint}</p>
            </div>
            <ul className="similar-list">
              {analysis.similar.map((s, i) => (
                <li key={`${s.lon}-${s.lat}`}>
                  <button type="button" onClick={() => onSelectSimilar(s.lon, s.lat, i + 1)}>
                    <span className="idx">{i + 1}</span>
                    <span>
                      <strong>{nearestNeighborhood(s.lon, s.lat, lang)}</strong>
                      <small>
                        {(Math.min(s.similarity, 1) * 100).toFixed(0)}% {copy.similarPct} · ~
                        {(s.distance_m / 1000).toFixed(1)} km
                      </small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}

      <footer className="panel-foot">
        <div>{copy.foot}</div>
        <div className="foot-note">{copy.footNote}</div>
      </footer>
    </aside>
  )
}
