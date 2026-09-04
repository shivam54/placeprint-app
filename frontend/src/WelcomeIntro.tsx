import { useEffect, useState } from 'react'
import { IntroDnaPreview } from './IntroDnaPreview'
import type { Lang } from './i18n'

const STORAGE_KEY = 'placeprint-intro-v1'

export function introAlreadySeen(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function markIntroSeen(): void {
  try {
    localStorage.setItem(STORAGE_KEY, '1')
  } catch {
    /* ignore */
  }
}

type Phase = 'hello' | 'brand' | 'features'
type Visual = 'dna' | null

type FeatureCard = {
  title: string
  body: string
  visual?: Visual
}

type Props = {
  lang: Lang
  onDone: (how: 'skip' | 'done') => void
}

const GREETINGS = ['Hello', 'Hola'] as const

const FEATURES: FeatureCard[] = [
  {
    title: 'Drop a pin',
    body: 'Explore San Francisco or use your location. Every story starts from one walk radius on the map.',
  },
  {
    title: 'Block DNA',
    body: 'A living diagram of what’s around you - restaurants, cafes, parks, clinics - the mix that makes this block feel like itself.',
    visual: 'dna',
  },
  {
    title: 'A short story',
    body: 'We turn nearby places into a plain-language read: named spots, the local vibe, and what’s happening near the pin.',
  },
  {
    title: 'Scout this pin',
    body: 'Chat with a local guide grounded in map data - weather, cafes, twin blocks - not the open web.',
  },
  {
    title: 'Find twin blocks',
    body: 'Pins 1–5 jump you to other SF pockets with a similar place mix. Same fabric, different street.',
  },
  {
    title: 'Explore the map',
    body: 'Tap a category on the DNA to light those places. Hover a dot for the name; click for distance and address.',
  },
  {
    title: 'English & Spanish',
    body: 'Placeprint speaks both - switch EN ↔ ES anytime in the panel. Same map, same story, your language.',
  },
]

const FEATURES_ES: FeatureCard[] = [
  {
    title: 'Coloca un pin',
    body: 'Explora San Francisco o usa tu ubicación. Cada historia empieza desde un radio a pie en el mapa.',
  },
  {
    title: 'ADN del bloque',
    body: 'Un diagrama vivo de lo que te rodea - restaurantes, cafés, parques, clínicas - el mix que hace que este bloque se sienta como sí mismo.',
    visual: 'dna',
  },
  {
    title: 'Una historia corta',
    body: 'Convertimos los lugares cercanos en una lectura sencilla: sitios con nombre, el vibe local y qué pasa cerca del pin.',
  },
  {
    title: 'Scout este pin',
    body: 'Habla con una guía local anclada a los datos del mapa - clima, cafés, bloques gemelos - no a la web abierta.',
  },
  {
    title: 'Encuentra bloques gemelos',
    body: 'Los pines 1–5 te llevan a otros bolsillos de SF con un mix similar. Misma tela, otra calle.',
  },
  {
    title: 'Explora el mapa',
    body: 'Toca una categoría del ADN para iluminar esos lugares. Pasa el cursor por un punto para el nombre; clic para distancia y dirección.',
  },
  {
    title: 'Inglés y español',
    body: 'Placeprint habla ambos - cambia EN ↔ ES cuando quieras en el panel. Mismo mapa, misma historia, tu idioma.',
  },
]

const UI = {
  en: {
    skip: 'Skip',
    continue: 'Continue',
    next: 'Next',
    back: 'Back',
    start: 'Get started',
    brand: 'Placeprint',
    tagline: 'The fingerprint of a San Francisco block.',
  },
  es: {
    skip: 'Saltar',
    continue: 'Continuar',
    next: 'Siguiente',
    back: 'Atrás',
    start: 'Empezar',
    brand: 'Placeprint',
    tagline: 'La huella de un bloque de San Francisco.',
  },
} as const

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function WelcomeIntro({ lang, onDone }: Props) {
  const copy = UI[lang]
  const cards = lang === 'es' ? FEATURES_ES : FEATURES
  const [phase, setPhase] = useState<Phase>('hello')
  const [greetIndex, setGreetIndex] = useState(0)
  const [greetVisible, setGreetVisible] = useState(true)
  const [cardIndex, setCardIndex] = useState(0)
  const [exiting, setExiting] = useState(false)

  const finish = (how: 'skip' | 'done' = 'done') => {
    if (exiting) return
    setExiting(true)
    markIntroSeen()
    window.setTimeout(() => onDone(how), 420)
  }

  useEffect(() => {
    if (phase !== 'hello') return

    const reduced = prefersReducedMotion()
    const hold = reduced ? 600 : 1400
    const fade = reduced ? 200 : 480

    const vanish = window.setTimeout(() => setGreetVisible(false), hold)
    const next = window.setTimeout(() => {
      if (greetIndex < GREETINGS.length - 1) {
        setGreetIndex((i) => i + 1)
        setGreetVisible(true)
      } else {
        setPhase('brand')
      }
    }, hold + fade)

    return () => {
      window.clearTimeout(vanish)
      window.clearTimeout(next)
    }
  }, [phase, greetIndex])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        finish('skip')
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        if (phase === 'brand') setPhase('features')
        else if (phase === 'features') {
          if (cardIndex >= cards.length - 1) finish('done')
          else setCardIndex((i) => i + 1)
        }
      }
      if (e.key === 'ArrowLeft' && phase === 'features' && cardIndex > 0) {
        e.preventDefault()
        setCardIndex((i) => i - 1)
      }
      if (e.key === 'ArrowRight' && phase === 'features') {
        e.preventDefault()
        if (cardIndex >= cards.length - 1) finish('done')
        else setCardIndex((i) => i + 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, cardIndex, cards.length, exiting])

  const onNextFeature = () => {
    if (cardIndex >= cards.length - 1) finish('done')
    else setCardIndex((i) => i + 1)
  }

  const onPrevFeature = () => {
    if (cardIndex <= 0) return
    setCardIndex((i) => i - 1)
  }

  const card = cards[cardIndex]

  return (
    <div
      className={`welcome-intro${exiting ? ' welcome-intro--out' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={copy.brand}
    >
      <div className="welcome-intro__glow welcome-intro__glow--a" aria-hidden />
      <div className="welcome-intro__glow welcome-intro__glow--b" aria-hidden />
      <div className="welcome-intro__grain" aria-hidden />

      <button type="button" className="welcome-intro__skip" onClick={() => finish('skip')}>
        {copy.skip}
      </button>

      {phase === 'hello' && (
        <div className="welcome-intro__stage welcome-intro__stage--hello">
          <p
            className={`welcome-intro__hello${greetVisible ? ' is-in' : ' is-out'}`}
            key={GREETINGS[greetIndex]}
          >
            {GREETINGS[greetIndex]}
          </p>
        </div>
      )}

      {phase === 'brand' && (
        <div className="welcome-intro__stage welcome-intro__stage--brand">
          <p className="welcome-intro__eyebrow">San Francisco</p>
          <h1 className="welcome-intro__brand">{copy.brand}</h1>
          <p className="welcome-intro__tagline">{copy.tagline}</p>
          <button
            type="button"
            className="welcome-intro__ghost"
            onClick={() => setPhase('features')}
          >
            {copy.continue}
          </button>
        </div>
      )}

      {phase === 'features' && card && (
        <div className="welcome-intro__stage welcome-intro__stage--features">
          <div
            className={`welcome-intro__card${card.visual === 'dna' ? ' welcome-intro__card--dna' : ''}`}
            key={cardIndex}
          >
            <span className="welcome-intro__card-idx">
              {cardIndex + 1} / {cards.length}
            </span>
            <h2>{card.title}</h2>
            {card.visual === 'dna' && <IntroDnaPreview lang={lang} />}
            <p>{card.body}</p>
          </div>

          <div className="welcome-intro__dots" role="tablist" aria-label={lang === 'es' ? 'Funciones' : 'Features'}>
            {cards.map((_, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={i === cardIndex}
                className={`welcome-intro__dot${i === cardIndex ? ' is-active' : ''}`}
                onClick={() => setCardIndex(i)}
              />
            ))}
          </div>

          <div className="welcome-intro__actions">
            <button
              type="button"
              className="welcome-intro__secondary"
              onClick={onPrevFeature}
              disabled={cardIndex <= 0}
            >
              {copy.back}
            </button>
            <button type="button" className="welcome-intro__primary" onClick={onNextFeature}>
              {cardIndex >= cards.length - 1 ? copy.start : copy.next}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
