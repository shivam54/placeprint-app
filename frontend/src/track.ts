/** Fire-and-forget product events for demo observability (no chat text / PII). */

export type TrackProps = Record<string, string | number | boolean>

export function track(name: string, props: TrackProps = {}): void {
  try {
    void fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, props }),
      keepalive: true,
    }).catch(() => {
      /* ignore */
    })
  } catch {
    /* ignore */
  }
}
