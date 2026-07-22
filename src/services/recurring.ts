import { db } from '../db/dexie'
import { addTask, updateTemplate } from '../db/repo'
import { occurrencesBetween } from './recurrence'
import { todayISO } from '../lib/dates'

/** Maksymalny wsteczny zakres tworzenia zaległych instancji (dni). */
const MAX_BACKFILL_DAYS = 14

function addDays(dateKey: string, days: number): string {
  return new Date(new Date(`${dateKey}T00:00:00`).getTime() + days * 86400000)
    .toISOString()
    .slice(0, 10)
}

/**
 * Utwórz brakujące instancje zadań z aktywnych szablonów cyklicznych,
 * dla wystąpień od ostatniej materializacji (lub dziś) do dziś włącznie.
 * Idempotentne — nie duplikuje instancji (dedup po templateId + dueDate).
 */
export async function materializeDueTasks(): Promise<number> {
  const today = todayISO()
  const templates = await db.recurringTemplates.toArray()
  let created = 0

  for (const tpl of templates) {
    if (!tpl.active) continue

    // Początek okna: dzień po ostatniej materializacji, ale nie dalej niż limit.
    let startKey = tpl.lastMaterializedDate
      ? addDays(tpl.lastMaterializedDate, 1)
      : today
    const floor = addDays(today, -MAX_BACKFILL_DAYS)
    if (startKey < floor) startKey = floor
    if (startKey > today) {
      // Nic do zrobienia, ale zapisz znacznik.
      await updateTemplate(tpl.id, { lastMaterializedDate: today })
      continue
    }

    const dates = occurrencesBetween(tpl.rule, startKey, today)

    for (const dueDate of dates) {
      const existing = await db.tasks
        .where('templateId')
        .equals(tpl.id)
        .filter((t) => t.dueDate === dueDate)
        .first()
      if (existing) continue
      await addTask({
        title: tpl.title,
        notes: tpl.notes,
        categoryId: tpl.categoryId,
        estimatedMinutes: tpl.estimatedMinutes,
        dueDate,
        templateId: tpl.id,
      })
      created++
    }

    await updateTemplate(tpl.id, { lastMaterializedDate: today })
  }

  return created
}
