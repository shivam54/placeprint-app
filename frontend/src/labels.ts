import type { Lang } from './i18n'

type Labeled = {
  label?: string
  label_es?: string
  includes?: string
  includes_es?: string
  headline?: string | null
  headline_es?: string | null
  top_label?: string
  top_label_es?: string
}

/** Prefer Spanish UI strings; place names stay as-is elsewhere. */
export function bucketLabel(item: Labeled | null | undefined, lang: Lang): string {
  if (!item) return ''
  if (lang === 'es' && item.label_es) return item.label_es
  return item.label || ''
}

export function bucketIncludes(item: Labeled | null | undefined, lang: Lang): string {
  if (!item) return ''
  if (lang === 'es' && item.includes_es) return item.includes_es
  return item.includes || ''
}

export function bucketHeadline(item: Labeled | null | undefined, lang: Lang): string {
  if (!item) return ''
  if (lang === 'es' && item.headline_es) return item.headline_es
  return item.headline || ''
}

export function topLabel(item: Labeled | null | undefined, lang: Lang): string {
  if (!item) return ''
  if (lang === 'es' && item.top_label_es) return item.top_label_es
  return item.top_label || ''
}
