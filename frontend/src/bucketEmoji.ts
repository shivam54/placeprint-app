/** Category emoji by bucket id - always correct, from our taxonomy. */
export const BUCKET_EMOJI: Record<string, string> = {
  restaurants: '🍜',
  cafes: '☕',
  bakeries: '🥐',
  groceries: '🛒',
  pharmacies: '💊',
  clothing: '👕',
  shops: '🛍️',
  bars: '🍸',
  parks: '🌳',
  outdoors: '🥾',
  playgrounds: '🛝',
  daycare: '🧒',
  gyms: '🏋️',
  studios: '🧘',
  bookstores: '📚',
  libraries: '📖',
  museums: '🏛️',
  galleries: '🖼️',
  theatres: '🎭',
  cinemas: '🎬',
  clinics: '🏥',
  dentists: '🦷',
  hospitals: '🏨',
}

export function bucketEmoji(bucket: string | null | undefined): string {
  if (!bucket) return '📍'
  return BUCKET_EMOJI[bucket] ?? '📍'
}
