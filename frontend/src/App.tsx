import { useEffect, useRef, useState } from 'react'
import {
  analyze,
  fetchMeta,
  fetchPlaces,
  type Analysis,
  type PlaceDot,
} from './api'
import { ChatDock } from './ChatDock'
import { MapView } from './MapView'
import { Panel } from './Panel'
import { ScoutFab } from './ScoutFab'
import { WelcomeIntro, introAlreadySeen } from './WelcomeIntro'
import type { Lang } from './i18n'
import { t } from './i18n'
import { guessCityName } from './cities'
import { reverseGeocode } from './geocode'
import { DEFAULT_CENTER, isInSf, nextExploreSpot } from './tours'
import { track } from './track'
import { bucketLabel, bucketIncludes } from './labels'
import './App.css'

type LocationGate = {
  placeDisplay: string | null
} | null

export default function App() {
  const [lang, setLang] = useState<Lang>('en')
  const [center, setCenter] = useState(DEFAULT_CENTER)
  const [radiusM, setRadiusM] = useState(800)
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [chatOpen, setChatOpen] = useState(false)
  const [activeBucket, setActiveBucket] = useState<string | null>(null)
  const [highlights, setHighlights] = useState<PlaceDot[]>([])
  const [hasInteracted, setHasInteracted] = useState(false)
  const [locationGate, setLocationGate] = useState<LocationGate>(null)
  const [locating, setLocating] = useState(false)
  const [startMode, setStartMode] = useState<'explore' | 'location'>('explore')
  const [showIntro, setShowIntro] = useState(() => !introAlreadySeen())
  const exploreIdx = useRef(0)
  const dragTimer = useRef<number | null>(null)

  useEffect(() => {
    fetchMeta().catch(() =>
      setError(
        lang === 'es'
          ? 'API no disponible. Arranca el backend de Python.'
          : 'API not reachable. Start the Python backend.',
      ),
    )
  }, [lang])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    analyze({
      lon: center.lon,
      lat: center.lat,
      radius_m: radiusM,
      priorities: [],
    })
      .then((result) => {
        if (!cancelled) setAnalysis(result)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Something went wrong')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [center.lon, center.lat, radiusM])

  useEffect(() => {
    if (!activeBucket) {
      setHighlights([])
      return
    }
    let cancelled = false
    fetchPlaces({
      lon: center.lon,
      lat: center.lat,
      radius_m: radiusM,
      bucket: activeBucket,
    }).then((places) => {
      if (!cancelled) setHighlights(places)
    })
    return () => {
      cancelled = true
    }
  }, [activeBucket, center.lon, center.lat, radiusM])

  const jumpTo = (lon: number, lat: number) => {
    setHasInteracted(true)
    setActiveBucket(null)
    setLocationGate(null)
    setCenter({ lon, lat })
  }

  const onPick = (lon: number, lat: number) => {
    jumpTo(lon, lat)
  }

  const onDragLive = (lon: number, lat: number) => {
    setHasInteracted(true)
    if (dragTimer.current) window.clearTimeout(dragTimer.current)
    dragTimer.current = window.setTimeout(() => {
      track('pin_drag')
      setActiveBucket(null)
      setCenter({ lon, lat })
    }, 180)
  }

  const onConfirmOutsideSf = () => {
    // Pin never left SF - stay on the current pin and continue exploring here
    track('explore_sf', { from: 'outside_gate' })
    setLocationGate(null)
    setStartMode('explore')
    setHasInteracted(true)
    if (!isInSf(center.lon, center.lat)) {
      setCenter(DEFAULT_CENTER)
    }
  }

  const onExploreSf = () => {
    track('explore_sf')
    const { spot, index } = nextExploreSpot(exploreIdx.current)
    exploreIdx.current = index
    setStartMode('explore')
    jumpTo(spot.lon, spot.lat)
  }

  const onUseLocation = () => {
    if (!navigator.geolocation) {
      setError(
        lang === 'es'
          ? 'La geolocalización no está disponible en este navegador.'
          : 'Geolocation not available in this browser.',
      )
      return
    }
    setLocating(true)
    setError(null)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lon = pos.coords.longitude
        const lat = pos.coords.latitude
        if (!isInSf(lon, lat)) {
          track('outside_sf')
          const place = await reverseGeocode(lon, lat, lang)
          const fallback = guessCityName(lon, lat, lang)
          setLocating(false)
          setStartMode('explore')
          setLocationGate({
            placeDisplay: place?.display ?? fallback,
          })
          // Stay on the current SF pin - user confirms with Explore San Francisco
          return
        }
        track('use_location')
        setLocating(false)
        setStartMode('location')
        jumpTo(lon, lat)
      },
      () => {
        setLocating(false)
        setError(
          lang === 'es'
            ? 'No se pudo leer tu ubicación. Prueba “Explorar San Francisco” o el mapa.'
            : 'Could not read your location. Try Explore San Francisco or click the map.',
        )
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  const openScout = () => {
    track('scout_open')
    setChatOpen(true)
  }

  const onSelectBucket = (id: string) => {
    setActiveBucket((prev) => {
      if (prev === id) {
        track('category_clear', { bucket: id })
        return null
      }
      track('category_tap', { bucket: id })
      return id
    })
  }

  const onSelectSimilar = (lon: number, lat: number, rank?: number) => {
    track('twin_jump', rank != null ? { rank } : {})
    jumpTo(lon, lat)
  }

  const copy = t(lang)
  const activeMeta =
    analysis?.dna.find((d) => d.id === activeBucket) ??
    analysis?.gaps.find((g) => g.id === activeBucket) ??
    analysis?.strengths.find((g) => g.id === activeBucket) ??
    null

  const gatePlace = locationGate?.placeDisplay
  const gateBody = gatePlace
    ? copy.outsideSfBody.replace('{place}', gatePlace)
    : copy.outsideSfBodyGeneric

  return (
    <div className={`app${showIntro ? ' app--intro-active' : ''}`}>
      <MapView
        center={center}
        compareCenter={null}
        radiusM={radiusM}
        similar={analysis?.similar ?? []}
        highlights={highlights}
        lang={lang}
        showDragHint={!hasInteracted}
        dragHintLabel={copy.dragHint}
        legendPin={copy.mapLegendPin}
        legendTwins={copy.mapLegendTwins}
        filterLabel={
          activeBucket && activeMeta
            ? `${activeMeta.emoji} ${copy.showingOnly} ${bucketLabel(activeMeta, lang)} · ${highlights.length}`
            : null
        }
        filterHint={activeMeta ? bucketIncludes(activeMeta, lang) || null : null}
        onClearFilter={() => {
          if (activeBucket) track('category_clear', { bucket: activeBucket })
          setActiveBucket(null)
        }}
        onPick={onPick}
        onTwinJump={(lon, lat, rank) => onSelectSimilar(lon, lat, rank)}
        onDragLive={onDragLive}
      />
      <Panel
        lang={lang}
        analysis={analysis}
        loading={loading}
        error={error}
        radiusM={radiusM}
        pinCenter={center}
        activeBucket={activeBucket}
        highlightCount={highlights.length}
        locating={locating}
        startMode={startMode}
        onRadius={setRadiusM}
        onUseLocation={onUseLocation}
        onExploreSf={onExploreSf}
        onSelectSimilar={onSelectSimilar}
        onSelectBucket={onSelectBucket}
        onOpenChat={openScout}
        onToggleLang={() => {
          track('lang_toggle', { to: lang === 'en' ? 'es' : 'en' })
          setLang((l) => (l === 'en' ? 'es' : 'en'))
        }}
      />
      <ChatDock
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        lang={lang}
        analysis={analysis}
      />
      {!chatOpen && (
        <ScoutFab
          label={copy.chatFab}
          hint={copy.scoutHint}
          onOpen={openScout}
        />
      )}

      {locationGate && (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="outside-sf-title"
          >
            <h2 id="outside-sf-title">{copy.outsideSfTitle}</h2>
            <p>{gateBody}</p>
            <div className="modal-actions">
              <button type="button" className="btn primary" onClick={onConfirmOutsideSf}>
                {copy.exploreSf}
              </button>
            </div>
          </div>
        </div>
      )}

      {showIntro && (
        <WelcomeIntro
          lang={lang}
          onDone={(how) => {
            track(how === 'skip' ? 'intro_skip' : 'intro_done')
            setShowIntro(false)
          }}
        />
      )}
    </div>
  )
}
