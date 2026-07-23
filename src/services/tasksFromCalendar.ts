import { db } from '../db/dexie'
import { addTask } from '../db/repo'
import { useSettings } from '../store/useSettings'
import { listEvents, type GCalEvent } from './google/calendar'
import { todayISO } from '../lib/dates'

/** Maksymalny wsteczny zakres materializacji zaległych dni. */
const MAX_BACKFILL_DAYS = 14
/** Ile dni w przód materializujemy wydarzenia jako zadania. */
const FORWARD_DAYS = 14

function addDays(dateKey: string, days: number): string {
  return new Date(new Date(`${dateKey}T00:00:00`).getTime() + days * 86400000)
    .toISOString()
    .slice(0, 10)
}

/**
 * Zmaterializuj wydarzenia z kalendarzy jako zadania to-do na dany dzień.
 *
 * Źródła: dedykowany kalendarz „cykliczny" (`taskCalendarId`) oraz kalendarze
 * dodane do podglądu (`readCalendarIds`). Uwzględniane są wydarzenia z okna
 * [dziś − backfill, dziś + FORWARD_DAYS] — także całodniowe (pole `start.date`).
 * Przyszłe wydarzenia stają się zadaniami z terminem w przód (widoczne osobno
 * w liście to-do). Idempotentne — dedup po `sourceEventId` (id wystąpienia Google).
 *
 * Watermark `lastTaskMaterializeDate` chroni PRZESZŁE dni przed ponownym
 * utworzeniem zadań już obsłużonych/usuniętych; przyszłość jest skanowana co uruchomienie.
 */
export async function materializeCalendarTasks(): Promise<number> {
  const { taskCalendarId, readCalendarIds, lastTaskMaterializeDate } =
    useSettings.getState()

  // Kalendarze źródłowe: dedykowany „cykliczny" + kalendarze do podglądu (bez duplikatów).
  const sources = [
    ...new Set([
      ...(taskCalendarId ? [taskCalendarId] : []),
      ...readCalendarIds,
    ]),
  ]
  if (sources.length === 0) return 0

  const today = todayISO()

  // Początek okna: dzień po ostatniej materializacji, nie dalej niż limit wstecz.
  // Gdy dziś już materializowano (watermark = dziś), start > dziś → skanujemy tylko przyszłość.
  let startKey = lastTaskMaterializeDate
    ? addDays(lastTaskMaterializeDate, 1)
    : today
  const floor = addDays(today, -MAX_BACKFILL_DAYS)
  if (startKey < floor) startKey = floor
  const endKey = addDays(today, FORWARD_DAYS)

  const timeMin = new Date(`${startKey}T00:00:00`).toISOString()
  const timeMax = new Date(`${endKey}T23:59:59`).toISOString()

  let created = 0
  for (const calId of sources) {
    let remote: GCalEvent[]
    try {
      remote = await listEvents(timeMin, timeMax, calId)
    } catch (e) {
      console.error('[materialize] listEvents nieudane dla', calId, e)
      continue
    }
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
  }

  useSettings.getState().update({ lastTaskMaterializeDate: today })
  return created
}
