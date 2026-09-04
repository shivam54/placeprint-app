import { useEffect, useRef, useState } from 'react'
import {
  AttributionControl,
  LngLatBounds,
  Map,
  Marker,
  NavigationControl,
  Popup,
  setWorkerUrl,
  type GeoJSONSource,
  type MapLayerMouseEvent,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// Vite production: bundle a self-contained worker or vector tiles never load
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import type { PlaceDot, SimilarArea } from './api'
import { bucketEmoji } from './bucketEmoji'
import type { Lang } from './i18n'
import {
  compassToward,
  formatDistance,
  nearestNeighborhood,
} from './neighborhoods'

setWorkerUrl(mapWorkerUrl)

type MapMood = 'day' | 'dusk' | 'night'

function emptyLine() {
  return { type: 'FeatureCollection' as const, features: [] as never[] }
}

function lineBetween(a: { lon: number; lat: number }, b: { lon: number; lat: number }) {
  return {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        properties: {},
        geometry: {
          type: 'LineString' as const,
          coordinates: [
            [a.lon, a.lat],
            [b.lon, b.lat],
          ],
        },
      },
    ],
  }
}

async function fetchMapMood(lat: number, lon: number): Promise<MapMood> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=is_day&timezone=America%2FLos_Angeles`
  const res = await fetch(url)
  if (!res.ok) return 'day'
  const data = (await res.json()) as {
    current?: { is_day?: number; time?: string }
  }
  const isDay = data.current?.is_day === 1
  const hour = Number((data.current?.time || '').slice(11, 13))
  if (!Number.isFinite(hour)) return isDay ? 'day' : 'night'
  if (!isDay || hour >= 20 || hour < 6) return 'night'
  if (hour >= 17 || hour < 8) return 'dusk'
  return 'day'
}

type Props = {
  center: { lon: number; lat: number }
  compareCenter?: { lon: number; lat: number } | null
  radiusM: number
  similar: SimilarArea[]
  highlights: PlaceDot[]
  lang?: Lang
  showDragHint?: boolean
  dragHintLabel?: string
  legendPin?: string
  legendTwins?: string
  filterLabel?: string | null
  filterHint?: string | null
  onClearFilter?: () => void
  onPick: (lon: number, lat: number) => void
  onTwinJump?: (lon: number, lat: number, rank: number) => void
  onDragLive?: (lon: number, lat: number) => void
}

function circlePolygon(lon: number, lat: number, radiusM: number, steps = 64) {
  const coords: [number, number][] = []
  const latRad = (lat * Math.PI) / 180
  const mPerDegLat = 111320
  const mPerDegLon = 111320 * Math.cos(latRad)
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2
    coords.push([
      lon + (radiusM * Math.cos(t)) / mPerDegLon,
      lat + (radiusM * Math.sin(t)) / mPerDegLat,
    ])
  }
  return {
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'Polygon' as const, coordinates: [coords] },
  }
}

function placesGeoJSON(places: PlaceDot[]) {
  return {
    type: 'FeatureCollection' as const,
    features: places.map((p) => ({
      type: 'Feature' as const,
      properties: {
        name: p.name || 'Unnamed place',
        category: p.category || '',
        address: p.address || '',
        bucket: p.bucket,
      },
      geometry: { type: 'Point' as const, coordinates: [p.lon, p.lat] },
    })),
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function distanceMeters(
  lon1: number,
  lat1: number,
  lon2: number,
  lat2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const R = 6371000
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}

function formatWalkDistance(meters: number, lang: Lang): string {
  const mins = Math.max(1, Math.round(meters / 80))
  if (meters >= 1000) {
    const km = (meters / 1000).toFixed(1)
    return lang === 'es' ? `~${km} km · ~${mins} min a pie` : `~${km} km · ~${mins} min walk`
  }
  const m = Math.round(meters)
  return lang === 'es' ? `~${m} m · ~${mins} min a pie` : `~${m} m · ~${mins} min walk`
}

export function MapView({
  center,
  compareCenter,
  radiusM,
  similar,
  highlights,
  lang = 'en',
  showDragHint = false,
  dragHintLabel = 'Drag pin',
  legendPin,
  legendTwins,
  filterLabel,
  filterHint,
  onClearFilter,
  onPick,
  onTwinJump,
  onDragLive,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Map | null>(null)
  const markerRef = useRef<Marker | null>(null)
  const compareMarkerRef = useRef<Marker | null>(null)
  const similarMarkers = useRef<Marker[]>([])
  const popupRef = useRef<Popup | null>(null)
  const detailPopupRef = useRef<Popup | null>(null)
  const pinPopupRef = useRef<Popup | null>(null)
  const onPickRef = useRef(onPick)
  const onTwinJumpRef = useRef(onTwinJump)
  const onDragRef = useRef(onDragLive)
  const langRef = useRef(lang)
  const centerRef = useRef(center)
  const [mapMood, setMapMood] = useState<MapMood>('day')
  onPickRef.current = onPick
  onTwinJumpRef.current = onTwinJump
  onDragRef.current = onDragLive
  langRef.current = lang
  centerRef.current = center

  const setPinNeighborhood = (name: string) => {
    const label = markerRef.current?.getElement().querySelector('.pin-nbhd')
    if (label) label.textContent = name
  }

  const clearTwinLink = () => {
    const map = mapRef.current
    const src = map?.getSource('twin-link') as GeoJSONSource | undefined
    src?.setData(emptyLine())
  }

  const showTwinLink = (toLon: number, toLat: number) => {
    const map = mapRef.current
    const src = map?.getSource('twin-link') as GeoJSONSource | undefined
    if (!src) return
    const from = centerRef.current
    src.setData(lineBetween(from, { lon: toLon, lat: toLat }))
  }

  const showPinLabel = (lon: number, lat: number, html: string) => {
    const map = mapRef.current
    if (!map) return
    const popup =
      pinPopupRef.current ??
      new Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 14,
        className: 'place-popup',
        maxWidth: '220px',
      })
    pinPopupRef.current = popup
    popup.setLngLat([lon, lat]).setHTML(html).addTo(map)
  }

  const hidePinLabel = () => {
    pinPopupRef.current?.remove()
  }

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new Map({
      container: containerRef.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [center.lon, center.lat],
      zoom: 13.2,
      attributionControl: false,
    })

    map.addControl(new NavigationControl({ showCompass: false }), 'bottom-left')
    map.addControl(
      new AttributionControl({
        compact: true,
        customAttribution:
          'Places © <a href="https://overturemaps.org/" target="_blank" rel="noreferrer">Overture</a>',
      }),
      'bottom-right',
    )

    const popup = new Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 12,
      className: 'place-popup',
      maxWidth: '260px',
    })
    popupRef.current = popup

    const detailPopup = new Popup({
      closeButton: true,
      closeOnClick: false,
      offset: 14,
      className: 'place-popup place-popup-detail',
      maxWidth: '280px',
    })
    detailPopupRef.current = detailPopup

    map.on('load', () => {
      map.addSource('radius', {
        type: 'geojson',
        data: circlePolygon(center.lon, center.lat, radiusM),
      })
      map.addLayer({
        id: 'radius-fill',
        type: 'fill',
        source: 'radius',
        paint: { 'fill-color': '#0e7c7b', 'fill-opacity': 0.16 },
      })
      map.addLayer({
        id: 'radius-line',
        type: 'line',
        source: 'radius',
        paint: { 'line-color': '#0e7c7b', 'line-width': 2.5, 'line-opacity': 0.9 },
      })
      map.addSource('twin-link', {
        type: 'geojson',
        data: emptyLine(),
      })
      map.addLayer({
        id: 'twin-link-line',
        type: 'line',
        source: 'twin-link',
        paint: {
          'line-color': '#10212b',
          'line-width': 1.6,
          'line-opacity': 0.45,
          'line-dasharray': [2.2, 1.6],
        },
      })
      map.addSource('highlights', {
        type: 'geojson',
        data: placesGeoJSON([]),
      })
      map.addLayer({
        id: 'highlight-glow',
        type: 'circle',
        source: 'highlights',
        paint: {
          'circle-radius': 10,
          'circle-color': '#c46b3a',
          'circle-opacity': 0.22,
        },
      })
      map.addLayer({
        id: 'highlight-dots',
        type: 'circle',
        source: 'highlights',
        paint: {
          'circle-radius': 5,
          'circle-color': '#c46b3a',
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#fff',
        },
      })

      const showHoverPopup = (e: MapLayerMouseEvent) => {
        if (detailPopup.isOpen()) return
        const feature = e.features?.[0]
        if (!feature || feature.geometry.type !== 'Point') return
        const name = String(feature.properties?.name ?? 'Unnamed place')
        const category = String(feature.properties?.category ?? '')
        const coords = feature.geometry.coordinates as [number, number]
        const html = category
          ? `<strong>${escapeHtml(name)}</strong><span>${escapeHtml(category.replaceAll('_', ' '))}</span>`
          : `<strong>${escapeHtml(name)}</strong>`
        popup.setLngLat(coords).setHTML(html).addTo(map)
        map.getCanvas().style.cursor = 'pointer'
      }

      map.on('mouseenter', 'highlight-dots', showHoverPopup)
      map.on('mousemove', 'highlight-dots', showHoverPopup)
      map.on('mouseleave', 'highlight-dots', () => {
        if (!detailPopup.isOpen()) popup.remove()
        map.getCanvas().style.cursor = ''
      })

      map.on('click', 'highlight-dots', (e) => {
        e.preventDefault()
        const feature = e.features?.[0]
        if (!feature || feature.geometry.type !== 'Point') return
        const name = String(feature.properties?.name ?? 'Unnamed place')
        const category = String(feature.properties?.category ?? '')
        const address = String(feature.properties?.address ?? '').trim()
        const bucket = String(feature.properties?.bucket ?? '')
        const emoji = bucketEmoji(bucket)
        const coords = feature.geometry.coordinates as [number, number]
        const pin = centerRef.current
        const meters = distanceMeters(pin.lon, pin.lat, coords[0], coords[1])
        const distLine = formatWalkDistance(meters, langRef.current)
        const catLine = category
          ? `<span>${escapeHtml(category.replaceAll('_', ' '))}</span>`
          : ''
        const addrLine = address
          ? `<span class="place-addr">${escapeHtml(address)}</span>`
          : `<span class="place-addr">${langRef.current === 'es' ? 'Dirección no disponible en Overture' : 'Address not in Overture data'}</span>`
        const html = `<div class="place-card"><div class="place-card-emoji" aria-hidden="true">${emoji}</div><div class="place-card-body"><strong>${escapeHtml(name)}</strong>${catLine}<span class="place-dist">${escapeHtml(distLine)}</span>${addrLine}</div></div>`
        popup.remove()
        detailPopup.setLngLat(coords).setHTML(html).addTo(map)
      })
    })

    map.on('click', (e) => {
      const hits = map.queryRenderedFeatures(e.point, {
        layers: map.getLayer('highlight-dots') ? ['highlight-dots'] : [],
      })
      if (hits.length) return
      detailPopup.remove()
      onPickRef.current(e.lngLat.lng, e.lngLat.lat)
    })

    const el = document.createElement('div')
    el.className = 'pin'
    el.innerHTML = `<span class="pin-nbhd"></span><span class="pin-hint">${dragHintLabel}</span>`
    const placeName = nearestNeighborhood(center.lon, center.lat, lang)
    el.title = placeName
    el.setAttribute('aria-label', placeName)
    const nbhd = el.querySelector('.pin-nbhd')
    if (nbhd) nbhd.textContent = placeName
    const marker = new Marker({ element: el, draggable: true })
      .setLngLat([center.lon, center.lat])
      .addTo(map)

    el.addEventListener('mouseenter', () => {
      const ll = marker.getLngLat()
      const name = nearestNeighborhood(ll.lng, ll.lat, langRef.current)
      showPinLabel(
        ll.lng,
        ll.lat,
        `<strong>${escapeHtml(name)}</strong><span>${langRef.current === 'es' ? 'Pin actual' : 'Current pin'}</span>`,
      )
    })
    el.addEventListener('mouseleave', hidePinLabel)

    marker.on('drag', () => {
      hidePinLabel()
      clearTwinLink()
      const ll = marker.getLngLat()
      setPinNeighborhood(nearestNeighborhood(ll.lng, ll.lat, langRef.current))
      const src = map.getSource('radius') as GeoJSONSource | undefined
      if (src) src.setData(circlePolygon(ll.lng, ll.lat, radiusM))
      onDragRef.current?.(ll.lng, ll.lat)
    })
    marker.on('dragend', () => {
      const ll = marker.getLngLat()
      onPickRef.current(ll.lng, ll.lat)
    })

    markerRef.current = marker
    mapRef.current = map
    return () => {
      popup.remove()
      popupRef.current = null
      detailPopup.remove()
      detailPopupRef.current = null
      pinPopupRef.current?.remove()
      pinPopupRef.current = null
      similarMarkers.current.forEach((m) => m.remove())
      compareMarkerRef.current?.remove()
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const tip = markerRef.current?.getElement().querySelector('.pin-hint')
    if (!tip) return
    tip.classList.toggle('hidden', !showDragHint)
    tip.textContent = dragHintLabel
  }, [showDragHint, dragHintLabel])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    markerRef.current?.setLngLat([center.lon, center.lat])
    const pinEl = markerRef.current?.getElement()
    const name = nearestNeighborhood(center.lon, center.lat, lang)
    if (pinEl) {
      pinEl.title = name
      pinEl.setAttribute('aria-label', name)
      // Replay land animation when the pin jumps (Explore / twin / click)
      pinEl.classList.remove('pin--land')
      void pinEl.offsetWidth
      pinEl.classList.add('pin--land')
    }
    setPinNeighborhood(name)
    clearTwinLink()
    map.easeTo({ center: [center.lon, center.lat], duration: 550 })
    const src = map.getSource('radius') as GeoJSONSource | undefined
    if (src) src.setData(circlePolygon(center.lon, center.lat, radiusM))
    // Soft radius “alive” pulse when the pin settles
    if (map.getLayer('radius-fill')) {
      let frame = 0
      const tick = () => {
        if (!mapRef.current?.getLayer('radius-fill')) return
        const t = frame / 18
        const opacity = 0.12 + 0.1 * Math.sin(t * Math.PI)
        map.setPaintProperty('radius-fill', 'fill-opacity', opacity)
        frame += 1
        if (frame < 19) requestAnimationFrame(tick)
        else map.setPaintProperty('radius-fill', 'fill-opacity', 0.16)
      }
      requestAnimationFrame(tick)
    }
  }, [center.lon, center.lat, radiusM, lang])

  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(() => {
      fetchMapMood(center.lat, center.lon)
        .then((mood) => {
          if (!cancelled) setMapMood(mood)
        })
        .catch(() => {
          if (!cancelled) setMapMood('day')
        })
    }, 400)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [center.lon, center.lat])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const src = map.getSource('highlights') as GeoJSONSource | undefined
    if (src) src.setData(placesGeoJSON(highlights))
    if (!highlights.length) {
      popupRef.current?.remove()
      detailPopupRef.current?.remove()
    }
  }, [highlights])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!compareCenter) {
      compareMarkerRef.current?.remove()
      compareMarkerRef.current = null
      return
    }
    const name = nearestNeighborhood(compareCenter.lon, compareCenter.lat, lang)
    const label = `${name} · Pin B`
    if (!compareMarkerRef.current) {
      const el = document.createElement('div')
      el.className = 'pin pin-b'
      el.title = label
      el.setAttribute('aria-label', label)
      el.addEventListener('mouseenter', () => {
        showPinLabel(
          compareCenter.lon,
          compareCenter.lat,
          `<strong>${escapeHtml(name)}</strong><span>Pin B</span>`,
        )
      })
      el.addEventListener('mouseleave', hidePinLabel)
      compareMarkerRef.current = new Marker({ element: el })
        .setLngLat([compareCenter.lon, compareCenter.lat])
        .addTo(map)
    } else {
      compareMarkerRef.current.setLngLat([compareCenter.lon, compareCenter.lat])
      const el = compareMarkerRef.current.getElement()
      el.title = label
      el.setAttribute('aria-label', label)
    }
  }, [compareCenter, lang])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    hidePinLabel()
    clearTwinLink()
    similarMarkers.current.forEach((m) => m.remove())
    similarMarkers.current = similar.map((s, i) => {
      const placeName = nearestNeighborhood(s.lon, s.lat, lang)
      const hereName = nearestNeighborhood(center.lon, center.lat, lang)
      const dir = compassToward(center.lon, center.lat, s.lon, s.lat, lang)
      const dist = formatDistance(s.distance_m, lang)
      // If same coarse area as the main pin, lead with direction so it doesn't look identical
      const headline =
        placeName === hereName
          ? lang === 'es'
            ? `${dist} al ${dir}`
            : `${dist} ${dir}`
          : placeName
      const sub =
        placeName === hereName
          ? lang === 'es'
            ? `${placeName} · zona parecida ${i + 1} · clic para ir`
            : `${placeName} · similar #${i + 1} · click to jump`
          : lang === 'es'
            ? `${dist} al ${dir} · zona parecida ${i + 1} · clic para ir`
            : `${dist} ${dir} · similar #${i + 1} · click to jump`

      const el = document.createElement('button')
      el.className = 'twin-pin'
      el.type = 'button'
      el.dataset.i = String(i)
      el.title = `${headline} - ${sub}`
      el.setAttribute('aria-label', `${headline}. ${sub}`)
      const inner = document.createElement('span')
      inner.className = 'twin-pin-inner'
      inner.textContent = String(i + 1)
      el.appendChild(inner)
      el.addEventListener('mouseenter', () => {
        showTwinLink(s.lon, s.lat)
        showPinLabel(
          s.lon,
          s.lat,
          `<strong>${escapeHtml(headline)}</strong><span>${escapeHtml(sub)}</span>`,
        )
      })
      el.addEventListener('mouseleave', () => {
        clearTwinLink()
        hidePinLabel()
      })
      el.addEventListener('click', (ev) => {
        ev.stopPropagation()
        clearTwinLink()
        hidePinLabel()
        const jump = onTwinJumpRef.current
        if (jump) jump(s.lon, s.lat, i + 1)
        else onPickRef.current(s.lon, s.lat)
      })
      return new Marker({ element: el }).setLngLat([s.lon, s.lat]).addTo(map)
    })

    // Keep every twin pin in view (far matches used to sit off-screen)
    if (similar.length > 0) {
      const bounds = new LngLatBounds([center.lon, center.lat], [center.lon, center.lat])
      for (const s of similar) {
        bounds.extend([s.lon, s.lat])
      }
      map.fitBounds(bounds, {
        padding: { top: 80, bottom: 96, left: 56, right: 56 },
        maxZoom: 13.4,
        duration: 750,
      })
    }
  }, [similar, lang, center.lon, center.lat])

  return (
    <div className={`map-shell map-shell--${mapMood}`}>
      <div className="map-root" ref={containerRef} />
      {filterLabel && (
        <div className="map-filter-chip">
          <div>
            <strong>{filterLabel}</strong>
            {filterHint && <span>{filterHint}</span>}
            <em>Hover a dot for the place name</em>
          </div>
          {onClearFilter && (
            <button type="button" onClick={onClearFilter}>
              Clear
            </button>
          )}
        </div>
      )}
      {(legendPin || legendTwins) && (
        <div className="map-legend">
          {legendPin && (
            <div>
              <span className="legend-swatch green" />
              {legendPin}
            </div>
          )}
          {legendTwins && (
            <div>
              <span className="legend-swatch dark" />
              {legendTwins}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
