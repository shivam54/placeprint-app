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
