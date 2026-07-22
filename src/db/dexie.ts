import Dexie, { type Table } from 'dexie'
import type { Task, Category, CalendarEvent, RecurringTemplate } from './types'

export class PlannerDB extends Dexie {
  tasks!: Table<Task, string>
  categories!: Table<Category, string>
  events!: Table<CalendarEvent, string>
  recurringTemplates!: Table<RecurringTemplate, string>

  constructor() {
    super('simple-planner')
    // Indeksy używane w zapytaniach (nie wszystkie pola).
    this.version(1).stores({
      tasks: 'id, status, categoryId, dueDate, order',
      categories: 'id, order',
      events: 'id, taskId, start, source, googleEventId, syncState',
    })
    // v2: szablony cykliczne + indeks templateId na zadaniach (deduplikacja instancji).
    this.version(2).stores({
      tasks: 'id, status, categoryId, dueDate, order, templateId',
      categories: 'id, order',
      events: 'id, taskId, start, source, googleEventId, syncState',
      recurringTemplates: 'id, active, order',
    })
  }
}

export const db = new PlannerDB()

/** Krótki, wystarczająco unikalny identyfikator (bez zależności od crypto.randomUUID). */
export function newId(): string {
  return (
    Date.now().toString(36) +
    '-' +
    Math.floor(Math.random() * 1e9).toString(36)
  )
}

/** Kategorie startowe zakładane przy pierwszym uruchomieniu. */
export async function ensureSeeded(): Promise<void> {
  const count = await db.categories.count()
  if (count > 0) return
  const seed: Category[] = [
    { id: newId(), name: 'Dom', color: 'var(--cat-1)', order: 0 },
    { id: newId(), name: 'Praca', color: 'var(--cat-2)', order: 1 },
    { id: newId(), name: 'Rachunki', color: 'var(--cat-3)', order: 2 },
    { id: newId(), name: 'Osobiste', color: 'var(--cat-4)', order: 3 },
  ]
  await db.categories.bulkAdd(seed)
}
