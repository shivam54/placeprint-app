import { useEffect, useRef, useState } from 'react'
import { chat, type Analysis } from './api'
import type { Lang } from './i18n'
import { t } from './i18n'

type Msg = { role: 'user' | 'bot'; text: string }

type Props = {
  open: boolean
  onClose: () => void
  lang: Lang
  analysis: Analysis | null
}

export function ChatDock({ open, onClose, lang, analysis }: Props) {
  const copy = t(lang)
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const greeted = useRef(false)
  const endRef = useRef<HTMLDivElement>(null)
  const pinKey = analysis
    ? `${analysis.center.lon.toFixed(4)}|${analysis.center.lat.toFixed(4)}|${analysis.radius_m}`
    : ''

  useEffect(() => {
    setMessages([])
    greeted.current = false
    setSuggestions(
      lang === 'es'
        ? ['Qué tiempo hace hoy', 'Qué falta cerca', 'Cafés cerca', 'Zonas parecidas']
        : ['What’s the weather today', 'What’s missing nearby', 'Cafes nearby', 'Similar areas'],
    )
  }, [lang, pinKey])

  useEffect(() => {
    if (!open || greeted.current || messages.length > 0) return
    greeted.current = true
    setMessages([{ role: 'bot', text: copy.scoutHello }])
  }, [open, copy.scoutHello, messages.length])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, busy, open])

  const send = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || busy) return
    setInput('')
    const prior = messages
    setMessages((m) => [...m, { role: 'user', text: trimmed }])
    setBusy(true)
    try {
      const history = prior.slice(-8).map((m) => ({
        role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: m.text,
      }))
      const res = await chat({ message: trimmed, lang, analysis, history })
      setMessages((m) => [...m, { role: 'bot', text: res.reply }])
      if (res.suggestions?.length) setSuggestions(res.suggestions)
    } catch {
      setMessages((m) => [
        ...m,
        {
          role: 'bot',
          text: lang === 'es' ? 'No pude responder ahora.' : 'Couldn’t answer just now.',
        },
      ])
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return (
    <div className="chat-dock">
      <header className="chat-head">
        <div>
          <strong>{copy.chatTitle}</strong>
          <span className="chat-sub">{copy.chatSub}</span>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
          ×
        </button>
      </header>
      <div className="chat-body">
        {messages.length === 0 && !busy && <p className="chat-empty">{copy.chatEmpty}</p>}
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            {m.text.split('\n').map((line, j) => (
              <p key={j}>{line || '\u00A0'}</p>
            ))}
          </div>
        ))}
        {busy && (
          <div className="bubble bot typing" aria-label="Thinking">
            <span />
            <span />
            <span />
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div className="chat-suggestions">
        {suggestions.map((s) => (
          <button key={s} type="button" className="chip" disabled={busy} onClick={() => void send(s)}>
            {s}
          </button>
        ))}
      </div>
      <form
        className="chat-form"
        onSubmit={(e) => {
          e.preventDefault()
          void send(input)
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={copy.chatPlaceholder}
          disabled={busy}
        />
        <button type="submit" className="btn primary" disabled={busy || !input.trim()}>
          {copy.chatSend}
        </button>
      </form>
    </div>
  )
}
