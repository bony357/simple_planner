import { db, newId } from '../../db/dexie'
import { useSettings } from '../../store/useSettings'
import { getAccessToken } from './auth'
import { insertEvent, listEvents, patchEvent, removeEvent } from './calendar'
import type { CalendarEvent } from '../../db/types'

let syncing = false

/**
 * Dwukierunkowa synchronizacja z Google Calendar.
 * Zasada local-first: najpierw wypychamy lokalne zmiany, potem pobieramy zdalne.
 * `interactive` = czy wolno pokazać okno logowania Google.
 */
export async function runSync(interactive = false): Promise<void> {
  const { syncCalendar, googleClientId } = useSettings.getState()
  if (!syncCalendar || !googleClientId.trim() || syncing) return
  syncing = true
  try {
    await getAccessToken(interactive)
    await pushLocal()
    await pullRemote()
    useSettings.getState().update({ lastSyncAt: new Date().toISOString() })
  } finally {
    syncing = false
  }
}

async function pushLocal(): Promise<void> {
  const pending = await db.events
    .where('syncState')
    .anyOf('pending', 'deleted')
    .toArray()

  for (const ev of pending) {
    try {
      if (ev.syncState === 'deleted') {
        if (ev.googleEventId) await removeEvent(ev.googleEventId)
        await db.events.delete(ev.id)
        continue
      }
      // pending
      if (ev.source === 'google' && !ev.googleEventId) continue
      if (ev.googleEventId) {
        await patchEvent(ev.googleEventId, {
          summary: ev.title,
          start: ev.start,
          end: ev.end,
        })
      } else {
        const created = await insertEvent({
          summary: ev.title,
          start: ev.start,
          end: ev.end,
        })
        await db.events.update(ev.id, { googleEventId: created.id })
      }
      await db.events.update(ev.id, { syncState: 'synced' })
    } catch {
      // Zostaw jako pending — spróbujemy przy następnym sync.
    }
  }
}

async function pullRemote(): Promise<void> {
  const now = new Date()
  const timeMin = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const timeMax = new Date(now.getTime() + 14 * 86400000).toISOString()

  const remote = await listEvents(timeMin, timeMax)
  const remoteIds = new Set<string>()

  for (const r of remote) {
    const start = r.start.dateTime
    const end = r.end.dateTime
    if (!start || !end) continue // pomijamy wydarzenia całodniowe
    remoteIds.add(r.id)

    const existing = await db.events.where('googleEventId').equals(r.id).first()
    if (existing) {
      // Local-first: nie nadpisujemy lokalnych zmian oczekujących na push.
      if (existing.syncState === 'synced') {
        await db.events.update(existing.id, {
          title: r.summary || '(bez tytułu)',
          start,
          end,
        })
      }
    } else {
      const ev: CalendarEvent = {
        id: newId(),
        title: r.summary || '(bez tytułu)',
        start,
        end,
        source: 'google',
        googleEventId: r.id,
        syncState: 'synced',
        updatedAt: new Date().toISOString(),
      }
      await db.events.add(ev)
    }
  }

  // Usuń lokalne kopie wydarzeń Google, które zniknęły zdalnie (w oknie).
  const localGoogle = await db.events.where('source').equals('google').toArray()
  for (const ev of localGoogle) {
    if (
      ev.googleEventId &&
      ev.start >= timeMin &&
      ev.start <= timeMax &&
      !remoteIds.has(ev.googleEventId) &&
      ev.syncState === 'synced'
    ) {
      await db.events.delete(ev.id)
    }
  }
}
