import { db } from '../db/dexie'
import { addTask } from '../db/repo'
import { useSettings } from '../store/useSettings'
import { listEvents } from './google/calendar'
import { todayISO } from '../lib/dates'

/** Maksymalny wsteczny zakres materializacji zaległych dni. */
const MAX_BACKFILL_DAYS = 14

function addDays(dateKey: string, days: number): string {
  return new Date(new Date(`${dateKey}T00:00:00`).getTime() + days * 86400000)
    .toISOString()
    .slice(0, 10)
}

/**
 * Zmaterializuj wydarzenia z wybranego kalendarza źródłowego jako zadania to-do
 * na dany dzień. Wszystkie wydarzenia (także jednorazowe) z okna [dziś − backfill, dziś]
 * stają się zadaniami. Idempotentne — dedup po `sourceEventId` (id wystąpienia Google).
 */
export async function materializeCalendarTasks(): Promise<number> {
  const { taskCalendarId, lastTaskMaterializeDate } = useSettings.getState()
  if (!taskCalendarId) return 0

  const today = todayISO()

  // Początek okna: dzień po ostatniej materializacji, nie dalej niż limit.
  let startKey = lastTaskMaterializeDate
    ? addDays(lastTaskMaterializeDate, 1)
    : today
  const floor = addDays(today, -MAX_BACKFILL_DAYS)
  if (startKey < floor) startKey = floor
  if (startKey > today) {
    useSettings.getState().update({ lastTaskMaterializeDate: today })
    return 0
  }

  const timeMin = new Date(`${startKey}T00:00:00`).toISOString()
  const timeMax = new Date(`${today}T23:59:59`).toISOString()
  const remote = await listEvents(timeMin, timeMax, taskCalendarId)

  let created = 0
  for (const r of remote) {
    // Data wystąpienia: dateTime (z czasem) lub date (całodniowe).
    const startIso = r.start.dateTime ?? r.start.date
    if (!startIso) continue
    const dueDate = startIso.slice(0, 10)

    const existing = await db.tasks
      .where('sourceEventId')
      .equals(r.id)
      .first()
    if (existing) continue

    await addTask({
      title: r.summary || '(bez tytułu)',
      dueDate,
      sourceEventId: r.id,
    })
    created++
  }

  useSettings.getState().update({ lastTaskMaterializeDate: today })
  return created
}
