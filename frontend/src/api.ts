export type BucketMeta = {
  id: string
  label: string
  label_es?: string
  emoji: string
  includes?: string
  includes_es?: string
}
export type PriorityMeta = { id: string; label: string; label_es?: string }
export type RadiusMeta = { id: number; label: string; label_es?: string }

export type Meta = {
  name: string
  city: string
  places: number
  buckets: BucketMeta[]
  priorities: PriorityMeta[]
  radii: RadiusMeta[]
}

export type DnaItem = {
  id: string
  label: string
  label_es?: string
  emoji: string
  includes?: string
  includes_es?: string
  count: number
  share: number
  city_percentile: number
  examples: { name: string; category: string | null }[]
}

export type GapItem = {
  id: string
  label: string
  label_es?: string
  emoji: string
  includes?: string
  includes_es?: string
  count: number
  peer_avg: number
  delta: number
  weight: number
  headline: string | null
  headline_es?: string | null
  severity?: number
}

export type SimilarArea = {
  lon: number
  lat: number
  similarity: number
  distance_m: number
  top_bucket: string
  top_label: string
  top_label_es?: string
  place_count: number
}

export type Analysis = {
  center: { lon: number; lat: number }
  radius_m: number
  place_count: number
  bucketed_count: number
  personality: string
  personality_es?: string
  verdict: { level: 'good' | 'mixed' | 'weak'; text: string; text_es?: string }
  dna: DnaItem[]
  gaps: GapItem[]
  strengths: GapItem[]
  similar: SimilarArea[]
  why: {
    method: string
    method_es?: string
    peer_cell_count: number
    city_places: number
    priorities: string[]
  }
}

export type PlaceDot = {
  name: string
  category: string | null
  address?: string | null
  bucket: string
  lon: number
  lat: number
}

export async function fetchMeta(): Promise<Meta> {
  const res = await fetch('/api/meta')
  if (!res.ok) throw new Error('Failed to load meta')
  return res.json()
}

export async function analyze(body: {
  lon: number
  lat: number
  radius_m: number
  priorities: string[]
}): Promise<Analysis> {
  const res = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || 'Analyze failed')
  }
  return res.json()
}

export async function fetchPlaces(body: {
  lon: number
  lat: number
  radius_m: number
  bucket: string
}): Promise<PlaceDot[]> {
  const q = new URLSearchParams({
    lon: String(body.lon),
    lat: String(body.lat),
    radius_m: String(body.radius_m),
    bucket: body.bucket,
  })
  const res = await fetch(`/api/places?${q}`)
  if (!res.ok) return []
  const data = await res.json()
  return data.places ?? []
}

export async function chat(body: {
  message: string
  lang: string
  analysis: Analysis | null
  history?: { role: 'user' | 'assistant'; content: string }[]
  weather?: PinWeather | null
}): Promise<{ reply: string; suggestions: string[]; source?: string }> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error('Chat failed')
  return res.json()
}

export type BlockSummary = {
  place_name: string
  place_count: number
  line: string
  strong?: { id: string; emoji: string; label: string }[]
  thin?: { id: string; emoji: string; label: string }[]
  spotlights?: string[]
  events?: string[]
  source: 'local' | 'claude'
  cached?: boolean
}

export async function fetchSummary(body: {
  analysis: Analysis
  place_name: string
  lang: string
}): Promise<BlockSummary | null> {
  const res = await fetch('/api/summary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) return null
  return res.json()
}

export type PinWeather = {
  ok: boolean
  temp_f: number
  feels_like_f: number
  condition: string
  weather_code: number
  is_day: boolean
  mood: string
  wind_mph: number
  humidity_pct: number
  observed_at?: string
  source?: string
}

const WMO_EN: Record<number, string> = {
  0: 'Clear',
  1: 'Mostly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Foggy',
  48: 'Icy fog',
  51: 'Light drizzle',
  53: 'Drizzle',
  55: 'Heavy drizzle',
  61: 'Light rain',
  63: 'Rain',
  65: 'Heavy rain',
  71: 'Light snow',
  73: 'Snow',
  75: 'Heavy snow',
  80: 'Light showers',
  81: 'Showers',
  82: 'Heavy showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with hail',
  99: 'Thunderstorm with heavy hail',
}

const WMO_ES: Record<string, string> = {
  Clear: 'Despejado',
  'Mostly clear': 'Mayormente despejado',
  'Partly cloudy': 'Parcialmente nublado',
  Overcast: 'Nublado',
  Foggy: 'Con niebla',
  'Icy fog': 'Niebla helada',
  'Light drizzle': 'Llovizna ligera',
  Drizzle: 'Llovizna',
  'Heavy drizzle': 'Llovizna fuerte',
  'Light rain': 'Lluvia ligera',
  Rain: 'Lluvia',
  'Heavy rain': 'Lluvia fuerte',
  'Light snow': 'Nieve ligera',
  Snow: 'Nieve',
  'Heavy snow': 'Nieve fuerte',
  'Light showers': 'Chubascos ligeros',
  Showers: 'Chubascos',
  'Heavy showers': 'Chubascos fuertes',
  Thunderstorm: 'Tormenta',
  'Thunderstorm with hail': 'Tormenta con granizo',
  'Thunderstorm with heavy hail': 'Tormenta con granizo fuerte',
}

function moodFromCode(code: number, isDay: boolean): string {
  if ([95, 96, 99].includes(code)) return 'storm'
  if ([71, 73, 75].includes(code)) return 'snow'
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return 'rain'
  if ([45, 48].includes(code)) return 'fog'
  if (code === 3) return 'cloudy'
  if (code === 2) return 'partly'
  if (code === 0 || code === 1) return isDay ? 'clear' : 'night'
  return isDay ? 'partly' : 'cloudy'
}

/** Browser → Open-Meteo (Render's server often cannot reach Open-Meteo). */
async function fetchWeatherClient(
  lat: number,
  lon: number,
  lang: string,
): Promise<PinWeather | null> {
  const q = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current:
      'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m,is_day',
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    timezone: 'America/Los_Angeles',
  })
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`)
  if (!res.ok) return null
  const payload = (await res.json()) as {
    current?: Record<string, number | string | null>
  }
  const cur = payload.current || {}
  const code = Number(cur.weather_code || 0)
  const isDay = Number(cur.is_day || 0) === 1
  let condition = WMO_EN[code] || 'Unknown'
  if (lang.toLowerCase().startsWith('es')) {
    condition = WMO_ES[condition] || condition
  }
  return {
    ok: true,
    source: 'Open-Meteo',
    temp_f: Math.round(Number(cur.temperature_2m || 0) * 10) / 10,
    feels_like_f: Math.round(Number(cur.apparent_temperature || 0) * 10) / 10,
    condition,
    weather_code: code,
    is_day: isDay,
    mood: moodFromCode(code, isDay),
    wind_mph: Math.round(Number(cur.wind_speed_10m || 0) * 10) / 10,
    humidity_pct: Number(cur.relative_humidity_2m || 0),
    observed_at: typeof cur.time === 'string' ? cur.time : undefined,
  }
}

export async function fetchWeather(
  lat: number,
  lon: number,
  lang: string,
): Promise<PinWeather | null> {
  try {
    const q = new URLSearchParams({
      lat: String(lat),
      lon: String(lon),
      lang,
    })
    const res = await fetch(`/api/weather?${q}`)
    if (res.ok) return res.json()
  } catch {
    // fall through to browser Open-Meteo
  }
  try {
    return await fetchWeatherClient(lat, lon, lang)
  } catch {
    return null
  }
}
