/** Default pin + random “Explore SF” landing spots. */

export const DEFAULT_CENTER = {
  lon: -122.494,
  lat: 37.76,
}

/** Matches backend SF demo bounds. */
export function isInSf(lon: number, lat: number): boolean {
  return lon >= -122.55 && lon <= -122.35 && lat >= 37.7 && lat <= 37.85
}

const EXPLORE_SPOTS: { lon: number; lat: number }[] = [
  { lon: -122.494, lat: 37.76 }, // Outer Sunset
  { lon: -122.4194, lat: 37.7599 }, // Mission
  { lon: -122.436, lat: 37.803 }, // Marina
  { lon: -122.466, lat: 37.763 }, // Inner Sunset
  { lon: -122.435, lat: 37.761 }, // Castro
  { lon: -122.405, lat: 37.778 }, // SOMA
  { lon: -122.41, lat: 37.8 }, // North Beach
  { lon: -122.448, lat: 37.77 }, // Haight
  { lon: -122.475, lat: 37.778 }, // Richmond
  { lon: -122.4, lat: 37.76 }, // Potrero
]

export function nextExploreSpot(previousIndex: number): {
  spot: { lon: number; lat: number }
  index: number
} {
  const index = (previousIndex + 1) % EXPLORE_SPOTS.length
  return { spot: EXPLORE_SPOTS[index], index }
}
