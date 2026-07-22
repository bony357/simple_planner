import { gapiFetch } from './auth'
import { useSettings } from '../../store/useSettings'
import type { CalendarInfo } from '../../db/types'

const API = 'https://www.googleapis.com/calendar/v3'

export interface GCalEvent {
  id: string
  summary?: string
  start: { dateTime?: string; date?: string }
  end: { dateTime?: string; date?: string }
  updated?: string
}

/** Kalendarz docelowy zapisu (jedyny zapisywalny). */
function writeCalendarId(): string {
  return encodeURIComponent(useSettings.getState().calendarId || 'primary')
}

/** Lista kalendarzy konta — do wyboru zapisu/podglądu w ustawieniach. */
export async function listCalendars(): Promise<CalendarInfo[]> {
  const res = await gapiFetch(`${API}/users/me/calendarList?maxResults=250`)
  if (!res.ok) throw new Error(`CalendarList: ${res.status}`)
  const data = await res.json()
  return ((data.items ?? []) as Record<string, unknown>[]).map((c) => ({
    id: String(c.id),
    summary: String(c.summaryOverride ?? c.summary ?? c.id),
    primary: Boolean(c.primary),
    accessRole: c.accessRole ? String(c.accessRole) : undefined,
    backgroundColor: c.backgroundColor ? String(c.backgroundColor) : undefined,
  }))
}

/** Pobierz wydarzenia z zadanego kalendarza w zakresie czasu (ISO). */
export async function listEvents(
  timeMin: string,
  timeMax: string,
  calId: string,
): Promise<GCalEvent[]> {
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250',
  })
  const res = await gapiFetch(
    `${API}/calendars/${encodeURIComponent(calId)}/events?${params}`,
  )
  if (!res.ok) throw new Error(`Calendar list (${calId}): ${res.status}`)
  const data = await res.json()
  return (data.items ?? []) as GCalEvent[]
}

export async function insertEvent(input: {
  summary: string
  start: string
  end: string
}): Promise<GCalEvent> {
  const res = await gapiFetch(`${API}/calendars/${writeCalendarId()}/events`, {
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
    `${API}/calendars/${writeCalendarId()}/events/${googleEventId}`,
    { method: 'PATCH', body: JSON.stringify(body) },
  )
  if (!res.ok) throw new Error(`Calendar patch: ${res.status}`)
}

export async function removeEvent(googleEventId: string): Promise<void> {
  const res = await gapiFetch(
    `${API}/calendars/${writeCalendarId()}/events/${googleEventId}`,
    { method: 'DELETE' },
  )
  // 404/410 = już nie istnieje — traktujemy jako sukces.
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`Calendar delete: ${res.status}`)
  }
}
