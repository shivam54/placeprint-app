/** Dense SF area centroids for plain-language pin labels. */
const AREAS: { name: string; nameEs: string; lon: number; lat: number }[] = [
  // Sunset / west
  { name: 'Outer Sunset', nameEs: 'Outer Sunset', lon: -122.494, lat: 37.76 },
  { name: 'Central Sunset', nameEs: 'Central Sunset', lon: -122.48, lat: 37.755 },
  { name: 'Inner Sunset', nameEs: 'Inner Sunset', lon: -122.466, lat: 37.763 },
  { name: 'Parkside', nameEs: 'Parkside', lon: -122.488, lat: 37.744 },
  { name: 'Golden Gate Heights', nameEs: 'Golden Gate Heights', lon: -122.472, lat: 37.754 },
  { name: 'Forest Hill', nameEs: 'Forest Hill', lon: -122.463, lat: 37.748 },
  { name: 'West Portal', nameEs: 'West Portal', lon: -122.466, lat: 37.74 },
  { name: 'St. Francis Wood', nameEs: 'St. Francis Wood', lon: -122.466, lat: 37.735 },
  // Richmond
  { name: 'Outer Richmond', nameEs: 'Outer Richmond', lon: -122.492, lat: 37.778 },
  { name: 'Central Richmond', nameEs: 'Central Richmond', lon: -122.475, lat: 37.778 },
  { name: 'Inner Richmond', nameEs: 'Inner Richmond', lon: -122.46, lat: 37.78 },
  { name: 'Seacliff', nameEs: 'Seacliff', lon: -122.487, lat: 37.787 },
  { name: 'Lake Street', nameEs: 'Lake Street', lon: -122.47, lat: 37.786 },
  // North
  { name: 'Marina', nameEs: 'Marina', lon: -122.436, lat: 37.803 },
  { name: 'Cow Hollow', nameEs: 'Cow Hollow', lon: -122.437, lat: 37.798 },
  { name: 'Pacific Heights', nameEs: 'Pacific Heights', lon: -122.435, lat: 37.792 },
  { name: 'Presidio Heights', nameEs: 'Presidio Heights', lon: -122.45, lat: 37.788 },
  { name: 'Presidio', nameEs: 'Presidio', lon: -122.466, lat: 37.798 },
  { name: 'Russian Hill', nameEs: 'Russian Hill', lon: -122.42, lat: 37.801 },
  { name: 'North Beach', nameEs: 'North Beach', lon: -122.41, lat: 37.8 },
  { name: 'Chinatown', nameEs: 'Chinatown', lon: -122.407, lat: 37.794 },
  { name: 'Nob Hill', nameEs: 'Nob Hill', lon: -122.415, lat: 37.793 },
  { name: 'Financial District', nameEs: 'Distrito Financiero', lon: -122.4, lat: 37.794 },
  { name: 'Embarcadero', nameEs: 'Embarcadero', lon: -122.393, lat: 37.795 },
  // Central
  { name: 'Hayes Valley', nameEs: 'Hayes Valley', lon: -122.425, lat: 37.776 },
  { name: 'Lower Haight', nameEs: 'Lower Haight', lon: -122.433, lat: 37.772 },
  { name: 'Haight-Ashbury', nameEs: 'Haight-Ashbury', lon: -122.448, lat: 37.77 },
  { name: 'Cole Valley', nameEs: 'Cole Valley', lon: -122.45, lat: 37.765 },
  { name: 'Panhandle', nameEs: 'Panhandle', lon: -122.442, lat: 37.772 },
  { name: 'Western Addition', nameEs: 'Western Addition', lon: -122.43, lat: 37.782 },
  { name: 'Japantown', nameEs: 'Japantown', lon: -122.43, lat: 37.785 },
  { name: 'Tenderloin', nameEs: 'Tenderloin', lon: -122.414, lat: 37.784 },
  { name: 'Civic Center', nameEs: 'Civic Center', lon: -122.418, lat: 37.779 },
  { name: 'SOMA', nameEs: 'SOMA', lon: -122.405, lat: 37.778 },
  { name: 'South Beach', nameEs: 'South Beach', lon: -122.391, lat: 37.78 },
  { name: 'Mission Bay', nameEs: 'Mission Bay', lon: -122.39, lat: 37.77 },
  // Mission / east
  { name: 'Mission', nameEs: 'Mission', lon: -122.419, lat: 37.76 },
  { name: 'Mission Dolores', nameEs: 'Mission Dolores', lon: -122.425, lat: 37.76 },
  { name: 'Castro', nameEs: 'Castro', lon: -122.435, lat: 37.761 },
  { name: 'Eureka Valley', nameEs: 'Eureka Valley', lon: -122.435, lat: 37.758 },
  { name: 'Noe Valley', nameEs: 'Noe Valley', lon: -122.433, lat: 37.75 },
  { name: 'Glen Park', nameEs: 'Glen Park', lon: -122.434, lat: 37.734 },
  { name: 'Bernal Heights', nameEs: 'Bernal Heights', lon: -122.415, lat: 37.741 },
  { name: 'Potrero Hill', nameEs: 'Potrero Hill', lon: -122.4, lat: 37.76 },
  { name: 'Dogpatch', nameEs: 'Dogpatch', lon: -122.389, lat: 37.76 },
  // South
  { name: 'Excelsior', nameEs: 'Excelsior', lon: -122.425, lat: 37.724 },
  { name: 'Outer Mission', nameEs: 'Outer Mission', lon: -122.44, lat: 37.72 },
  { name: 'Ingleside', nameEs: 'Ingleside', lon: -122.455, lat: 37.723 },
  { name: 'Oceanview', nameEs: 'Oceanview', lon: -122.458, lat: 37.714 },
  { name: 'Visitacion Valley', nameEs: 'Visitacion Valley', lon: -122.406, lat: 37.714 },
  { name: 'Bayview', nameEs: 'Bayview', lon: -122.39, lat: 37.73 },
  { name: 'Hunters Point', nameEs: 'Hunters Point', lon: -122.375, lat: 37.727 },
  { name: 'Portola', nameEs: 'Portola', lon: -122.41, lat: 37.727 },
]

function dist2(aLon: number, aLat: number, bLon: number, bLat: number) {
  const dx = aLon - bLon
  const dy = aLat - bLat
  return dx * dx + dy * dy
}

export function nearestNeighborhood(
  lon: number,
  lat: number,
  lang: 'en' | 'es' = 'en',
): string {
  let best = AREAS[0]
  let bestD = Infinity
  for (const n of AREAS) {
    const d = dist2(lon, lat, n.lon, n.lat)
    if (d < bestD) {
      bestD = d
      best = n
    }
  }
  return lang === 'es' ? best.nameEs : best.name
}

/** Compass direction from A → B (for distinguishing nearby similar pins). */
export function compassToward(
  fromLon: number,
  fromLat: number,
  toLon: number,
  toLat: number,
  lang: 'en' | 'es' = 'en',
): string {
  const dLon = toLon - fromLon
  const dLat = toLat - fromLat
  if (Math.abs(dLon) < 1e-7 && Math.abs(dLat) < 1e-7) {
    return lang === 'es' ? 'aquí' : 'here'
  }
  const angle = (Math.atan2(dLon, dLat) * 180) / Math.PI // 0 = north
  const dirsEn = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest']
  const dirsEs = ['norte', 'noreste', 'este', 'sureste', 'sur', 'suroeste', 'oeste', 'noroeste']
  const dirs = lang === 'es' ? dirsEs : dirsEn
  const idx = Math.round(((angle + 360) % 360) / 45) % 8
  return dirs[idx]
}

export function formatDistance(meters: number, lang: 'en' | 'es' = 'en'): string {
  if (meters >= 1000) {
    const km = (meters / 1000).toFixed(1)
    return lang === 'es' ? `${km} km` : `${km} km`
  }
  return lang === 'es' ? `${Math.round(meters)} m` : `${Math.round(meters)} m`
}
