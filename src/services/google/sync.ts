import { db, newId } from '../../db/dexie'
import { useSettings } from '../../store/useSettings'
import { getAccessToken } from './auth'
import { insertEvent, listEvents, patchEvent, removeEvent } from './calendar'
import { runTasksSync } from './tasksSync'
import type { CalendarEvent } from '../../db/types'

let inFlight: Promise<SyncResult | undefined> | null = null
let debounceTimer: ReturnType<typeof setTimeout> | null = null

export interface SyncResult {
  pushed: number
  pulled: number
}

/**
 * Dwukierunkowa synchronizacja z Google Calendar.
 * Zasada local-first: najpierw wypychamy lokalne zmiany, potem pobieramy zdalne.
 * `interactive` = czy wolno pokazać okno logowania Google.
 * W trybie interaktywnym błędy są rzucane (do pokazania w UI); w tle — połykane.
 *
 * Gdy synchronizacja już trwa, kolejne wywołania dołączają do tej samej operacji
 * (zamiast być po cichu pomijane) — dzięki temu blokada nie potrafi „utknąć",
 * a przycisk w UI nigdy nie zgłasza fałszywie „pominięto".
 */
export async function runSync(interactive = false): Promise<SyncResult | undefined> {
  const { syncCalendar, googleClientId } = useSettings.getState()
  if (!syncCalendar || !googleClientId.trim()) return
  if (inFlight) return inFlight

  inFlight = (async () => {
    try {
      await getAccessToken(interactive)
      const pushed = await pushLocal()
      const pulled = await pullRemote()
      useSettings.getState().update({
        lastSyncAt: new Date().toISOString(),
        lastSyncError: undefined,
      })
      return { pushed, pulled }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      console.error('[sync] runSync nieudany', e)
      useSettings.getState().update({ lastSyncError: message })
      if (interactive) throw e
      return undefined
    } finally {
      inFlight = null
    }
  })()
  return inFlight
}

/**
 * Zaplanuj synchronizację w tle (debounce) po lokalnej zmianie wydarzeń.
 * Wykonuje się tylko gdy sync jest włączony; token pobierany po cichu.
 */
export function scheduleSync(): void {
  if (!useSettings.getState().syncCalendar) return
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    void runSync(false).then(async (res) => {
      // Po udanej synchronizacji (lokalne wydarzenia mają już googleEventId)
      // od razu materializujemy nowe wydarzenia jako zadania to-do i wypychamy
      // je do Google Tasks. Bez tego wydarzenie utworzone w „Planie dnia"
      // pojawiało się na liście to-do dopiero po ręcznym odświeżeniu strony.
      // Dynamiczny import zrywa cykl sync → tasksFromCalendar → repo → sync.
      if (!res) return
      try {
        const { materializeCalendarTasks } = await import('../tasksFromCalendar')
        await materializeCalendarTasks()
        await runTasksSync(false)
      } catch (e) {
        console.error('[sync] materializacja po synchronizacji nieudana', e)
      }
    })
  }, 1500)
}

async function pushLocal(): Promise<number> {
  const pending = await db.events
    .where('syncState')
    .anyOf('pending', 'deleted')
    .toArray()
  let count = 0

  let firstError: unknown = null
  for (const ev of pending) {
    try {
      // Kalendarze tylko do podglądu: nigdy nie zapisujemy do Google.
      if (ev.readOnly) {
        if (ev.syncState === 'deleted') await db.events.delete(ev.id)
        continue
      }
      if (ev.syncState === 'deleted') {
        if (ev.googleEventId) await removeEvent(ev.googleEventId)
        await db.events.delete(ev.id)
        count++
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
      count++
    } catch (e) {
      // Zostaw jako pending — spróbujemy ponownie; zapamiętaj pierwszy błąd.
      console.error('[sync] push nieudany dla wydarzenia', ev.id, ev.title, e)
      if (!firstError) firstError = e
    }
  }
  // Jeśli nic nie wypchnęliśmy, a był błąd — zgłoś go (diagnostyka w UI).
  if (count === 0 && firstError) throw firstError
  return count
}

async function pullRemote(): Promise<number> {
  const now = new Date()
  const timeMin = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const timeMax = new Date(now.getTime() + 14 * 86400000).toISOString()

  const { calendarId, readCalendarIds, availableCalendars } = useSettings.getState()
  const writeCal = calendarId || 'primary'
  // Kalendarze do pobrania: zapisywalny + wybrane do podglądu (bez duplikatów).
  const calendars = [...new Set([writeCal, ...readCalendarIds])]
  const colorOf = (id: string) =>
    availableCalendars.find((c) => c.id === id)?.backgroundColor

  const remoteIds = new Set<string>()
  let pulled = 0

  for (const calId of calendars) {
    const readOnly = calId !== writeCal
    const remote = await listEvents(timeMin, timeMax, calId)
    for (const r of remote) {
      const start = r.start.dateTime
      const end = r.end.dateTime
      if (!start || !end) continue // pomijamy wydarzenia całodniowe
      remoteIds.add(r.id)
      // Kalendarze podglądu kolorujemy wg koloru kalendarza (rozróżnienie źródła).
      const color = readOnly ? colorOf(calId) : undefined

      const existing = await db.events.where('googleEventId').equals(r.id).first()
      if (existing) {
        // Local-first: nie nadpisujemy lokalnych zmian oczekujących na push.
        if (existing.syncState === 'synced') {
          await db.events.update(existing.id, {
            title: r.summary || '(bez tytułu)',
            start,
            end,
            calendarId: calId,
            readOnly,
            color: color ?? existing.color,
          })
        }
      } else {
        const ev: CalendarEvent = {
          id: newId(),
          title: r.summary || '(bez tytułu)',
          start,
          end,
          color,
          source: 'google',
          googleEventId: r.id,
          calendarId: calId,
          readOnly,
          syncState: 'synced',
          updatedAt: new Date().toISOString(),
        }
        await db.events.add(ev)
        pulled++
      }
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
  return pulled
}
