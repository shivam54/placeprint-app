/** Coarse city guess for “you’re in X, but this is SF” messaging. */

const CITIES: { name: string; nameEs: string; lon: number; lat: number }[] = [
  { name: 'Los Angeles', nameEs: 'Los Ángeles', lon: -118.2437, lat: 34.0522 },
  { name: 'San Diego', nameEs: 'San Diego', lon: -117.1611, lat: 32.7157 },
  { name: 'San Jose', nameEs: 'San José', lon: -121.8863, lat: 37.3382 },
  { name: 'Oakland', nameEs: 'Oakland', lon: -122.2712, lat: 37.8044 },
  { name: 'Sacramento', nameEs: 'Sacramento', lon: -121.4944, lat: 38.5816 },
  { name: 'Seattle', nameEs: 'Seattle', lon: -122.3321, lat: 47.6062 },
  { name: 'Portland', nameEs: 'Portland', lon: -122.6765, lat: 45.5152 },
  { name: 'Las Vegas', nameEs: 'Las Vegas', lon: -115.1398, lat: 36.1699 },
  { name: 'Phoenix', nameEs: 'Phoenix', lon: -112.074, lat: 33.4484 },
  { name: 'Denver', nameEs: 'Denver', lon: -104.9903, lat: 39.7392 },
  { name: 'Chicago', nameEs: 'Chicago', lon: -87.6298, lat: 41.8781 },
  { name: 'Austin', nameEs: 'Austin', lon: -97.7431, lat: 30.2672 },
  { name: 'Dallas', nameEs: 'Dallas', lon: -96.797, lat: 32.7767 },
  { name: 'Houston', nameEs: 'Houston', lon: -95.3698, lat: 29.7604 },
  { name: 'New York', nameEs: 'Nueva York', lon: -74.006, lat: 40.7128 },
  { name: 'Boston', nameEs: 'Boston', lon: -71.0589, lat: 42.3601 },
  { name: 'Washington, D.C.', nameEs: 'Washington D. C.', lon: -77.0369, lat: 38.9072 },
  { name: 'Miami', nameEs: 'Miami', lon: -80.1918, lat: 25.7617 },
  { name: 'Atlanta', nameEs: 'Atlanta', lon: -84.388, lat: 33.749 },
  { name: 'Toronto', nameEs: 'Toronto', lon: -79.3832, lat: 43.6532 },
  { name: 'Vancouver', nameEs: 'Vancouver', lon: -123.1207, lat: 49.2827 },
  { name: 'London', nameEs: 'Londres', lon: -0.1276, lat: 51.5072 },
]

/** Rough degrees ≈ 80–100 km - only name a city if we're that close. */
const MAX_DEG = 0.9

export function guessCityName(
  lon: number,
  lat: number,
  lang: 'en' | 'es' = 'en',
): string | null {
  let best: (typeof CITIES)[0] | null = null
  let bestD = Infinity
  for (const c of CITIES) {
    const d = (c.lon - lon) ** 2 + (c.lat - lat) ** 2
    if (d < bestD) {
      bestD = d
      best = c
    }
  }
  if (!best || bestD > MAX_DEG * MAX_DEG) return null
  return lang === 'es' ? best.nameEs : best.name
}
