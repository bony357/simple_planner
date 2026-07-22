import { gapiFetch } from './auth'
import { useSettings } from '../../store/useSettings'

const API = 'https://www.googleapis.com/calendar/v3'

export interface GCalEvent {
  id: string
  summary?: string
  start: { dateTime?: string; date?: string }
  end: { dateTime?: string; date?: string }
  updated?: string
}

function calendarId(): string {
  return encodeURIComponent(useSettings.getState().calendarId || 'primary')
}

/** Pobierz wydarzenia z zadanego zakresu czasu (ISO). */
export async function listEvents(timeMin: string, timeMax: string): Promise<GCalEvent[]> {
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250',
  })
  const res = await gapiFetch(`${API}/calendars/${calendarId()}/events?${params}`)
  if (!res.ok) throw new Error(`Calendar list: ${res.status}`)
  const data = await res.json()
  return (data.items ?? []) as GCalEvent[]
}

export async function insertEvent(input: {
  summary: string
  start: string
  end: string
}): Promise<GCalEvent> {
  const res = await gapiFetch(`${API}/calendars/${calendarId()}/events`, {
    method: 'POST',
    body: JSON.stringify({
      summary: input.summary,
      start: { dateTime: input.start },
      end: { dateTime: input.end },
    }),
  })
  if (!res.ok) throw new Error(`Calendar insert: ${res.status}`)
  return res.json()
}

export async function patchEvent(
  googleEventId: string,
  input: { summary?: string; start?: string; end?: string },
): Promise<void> {
  const body: Record<string, unknown> = {}
  if (input.summary) body.summary = input.summary
  if (input.start) body.start = { dateTime: input.start }
  if (input.end) body.end = { dateTime: input.end }
  const res = await gapiFetch(
    `${API}/calendars/${calendarId()}/events/${googleEventId}`,
    { method: 'PATCH', body: JSON.stringify(body) },
  )
  if (!res.ok) throw new Error(`Calendar patch: ${res.status}`)
}

export async function removeEvent(googleEventId: string): Promise<void> {
  const res = await gapiFetch(
    `${API}/calendars/${calendarId()}/events/${googleEventId}`,
    { method: 'DELETE' },
  )
  // 404/410 = już nie istnieje — traktujemy jako sukces.
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`Calendar delete: ${res.status}`)
  }
}
