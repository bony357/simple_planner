import { db, newId } from './dexie'
import type { Task, Category, CalendarEvent, RecurringTemplate } from './types'
import { scheduleSync } from '../services/google/sync'

const nowIso = () => new Date().toISOString()

/* ----------------------------- Zadania ----------------------------- */

export async function addTask(input: Partial<Task> & { title: string }): Promise<Task> {
  const maxOrder = await db.tasks
    .where('status')
    .equals('todo')
    .toArray()
    .then((ts) => ts.reduce((m, t) => Math.max(m, t.order), -1))
  const task: Task = {
    id: newId(),
    title: input.title.trim(),
    notes: input.notes,
    categoryId: input.categoryId,
    status: input.status ?? 'todo',
    createdAt: nowIso(),
    completedAt: input.status === 'done' ? nowIso() : undefined,
    dueDate: input.dueDate,
    recurrenceRule: input.recurrenceRule,
    templateId: input.templateId,
    estimatedMinutes: input.estimatedMinutes,
    order: maxOrder + 1,
  }
  await db.tasks.add(task)
  return task
}

export async function updateTask(id: string, patch: Partial<Task>): Promise<void> {
  await db.tasks.update(id, patch)
}

export async function toggleTaskDone(task: Task): Promise<void> {
  const done = task.status !== 'done'
  await db.tasks.update(task.id, {
    status: done ? 'done' : 'todo',
    completedAt: done ? nowIso() : undefined,
  })
}

export async function deleteTask(id: string): Promise<void> {
  await db.transaction('rw', db.tasks, db.events, async () => {
    await db.tasks.delete(id)
    // Odłącz powiązane wydarzenia (nie usuwamy ich z kalendarza automatycznie).
    const linked = await db.events.where('taskId').equals(id).toArray()
    await Promise.all(
      linked.map((e) => db.events.update(e.id, { taskId: undefined })),
    )
  })
}

/* ---------------------------- Kategorie ---------------------------- */

export async function addCategory(name: string, color: string): Promise<Category> {
  const max = await db.categories
    .toArray()
    .then((cs) => cs.reduce((m, c) => Math.max(m, c.order), -1))
  const cat: Category = { id: newId(), name: name.trim(), color, order: max + 1 }
  await db.categories.add(cat)
  return cat
}

export async function updateCategory(id: string, patch: Partial<Category>): Promise<void> {
  await db.categories.update(id, patch)
}

export async function deleteCategory(id: string): Promise<void> {
  await db.transaction('rw', db.categories, db.tasks, async () => {
    await db.categories.delete(id)
    const tasks = await db.tasks.where('categoryId').equals(id).toArray()
    await Promise.all(
      tasks.map((t) => db.tasks.update(t.id, { categoryId: undefined })),
    )
  })
}

/* ----------------------- Szablony cykliczne ------------------------ */

export async function addTemplate(
  input: Partial<RecurringTemplate> & { title: string; rule: string },
): Promise<RecurringTemplate> {
  const max = await db.recurringTemplates
    .toArray()
    .then((ts) => ts.reduce((m, t) => Math.max(m, t.order), -1))
  const tpl: RecurringTemplate = {
    id: newId(),
    title: input.title.trim(),
    notes: input.notes,
    categoryId: input.categoryId,
    estimatedMinutes: input.estimatedMinutes,
    rule: input.rule,
    active: input.active ?? true,
    order: max + 1,
  }
  await db.recurringTemplates.add(tpl)
  return tpl
}

export async function updateTemplate(
  id: string,
  patch: Partial<RecurringTemplate>,
): Promise<void> {
  await db.recurringTemplates.update(id, patch)
}

export async function deleteTemplate(id: string): Promise<void> {
  await db.recurringTemplates.delete(id)
  // Instancje-zadania pozostają (mogą być już zaplanowane); odłącz powiązanie.
  const linked = await db.tasks.where('templateId').equals(id).toArray()
  await Promise.all(
    linked.map((t) => db.tasks.update(t.id, { templateId: undefined })),
  )
}

/* ---------------------------- Wydarzenia --------------------------- */

export async function addEvent(
  input: Partial<CalendarEvent> & { title: string; start: string; end: string },
): Promise<CalendarEvent> {
  const event: CalendarEvent = {
    id: newId(),
    taskId: input.taskId,
    title: input.title,
    start: input.start,
    end: input.end,
    color: input.color,
    source: input.source ?? 'local',
    googleEventId: input.googleEventId,
    syncState: 'pending',
    updatedAt: nowIso(),
  }
  await db.events.add(event)
  scheduleSync()
  return event
}

export async function updateEvent(id: string, patch: Partial<CalendarEvent>): Promise<void> {
  await db.events.update(id, {
    ...patch,
    updatedAt: nowIso(),
    // Każda lokalna zmiana wymaga ponownej synchronizacji.
    syncState: patch.syncState ?? 'pending',
  })
  scheduleSync()
}

export async function deleteEvent(id: string): Promise<void> {
  const ev = await db.events.get(id)
  if (!ev) return
  if (ev.googleEventId) {
    // Oznacz do usunięcia w Google przy najbliższym sync.
    await db.events.update(id, { syncState: 'deleted', updatedAt: nowIso() })
  } else {
    await db.events.delete(id)
  }
  scheduleSync()
}
