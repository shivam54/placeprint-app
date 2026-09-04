/** Client-side reverse geocode for “you’re in City, State” messaging. */

export type PlaceLabel = {
  city: string
  region: string | null
  display: string
}

type CacheEntry = { key: string; value: PlaceLabel | null }

let cache: CacheEntry | null = null

function roundCoord(n: number) {
  return n.toFixed(3)
}

/**
 * Best-effort city + state/region from the browser.
 * Uses BigDataCloud’s keyless reverse-geocode endpoint.
 */
export async function reverseGeocode(
  lon: number,
  lat: number,
  lang: 'en' | 'es' = 'en',
): Promise<PlaceLabel | null> {
  const key = `${roundCoord(lat)},${roundCoord(lon)},${lang}`
  if (cache?.key === key) return cache.value

  try {
    const url = new URL('https://api.bigdatacloud.net/data/reverse-geocode-client')
    url.searchParams.set('latitude', String(lat))
    url.searchParams.set('longitude', String(lon))
    url.searchParams.set('localityLanguage', lang === 'es' ? 'es' : 'en')

    const res = await fetch(url.toString())
    if (!res.ok) throw new Error(`geocode ${res.status}`)
    const data = (await res.json()) as {
      city?: string
      locality?: string
      principalSubdivision?: string
      countryName?: string
    }

    const city = (data.city || data.locality || '').trim()
    const region = (data.principalSubdivision || '').trim() || null
    if (!city && !region) {
      cache = { key, value: null }
      return null
    }

    const display = [city || null, region].filter(Boolean).join(', ')
    const value: PlaceLabel = {
      city: city || region || 'somewhere',
      region,
      display: display || city,
    }
    cache = { key, value }
    return value
  } catch {
    cache = { key, value: null }
    return null
  }
}
