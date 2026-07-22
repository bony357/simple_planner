import { gapiFetch } from './auth'
import { useSettings } from '../../store/useSettings'
import { db } from '../../db/dexie'
import type { Category, Task } from '../../db/types'

const API = 'https://sheets.googleapis.com/v4/spreadsheets'

const TASK_HEADERS = [
  'id',
  'title',
  'notes',
  'categoryId',
  'status',
  'createdAt',
  'completedAt',
  'dueDate',
  'recurrenceRule',
  'estimatedMinutes',
  'order',
]
const CAT_HEADERS = ['id', 'name', 'color', 'order']

/** Utwórz nowy arkusz z zakładkami Tasks/Categories i zapisz jego ID w ustawieniach. */
export async function ensureSpreadsheet(): Promise<string> {
  const existing = useSettings.getState().sheetsId.trim()
  if (existing) return existing

  const res = await gapiFetch(API, {
    method: 'POST',
    body: JSON.stringify({
      properties: { title: 'Simple Planner — dane' },
      sheets: [
        { properties: { title: 'Tasks' } },
        { properties: { title: 'Categories' } },
      ],
    }),
  })
  if (!res.ok) throw new Error(`Sheets create: ${res.status}`)
  const data = await res.json()
  const id = data.spreadsheetId as string
  useSettings.getState().update({ sheetsId: id })
  return id
}

async function writeRange(id: string, range: string, values: unknown[][]): Promise<void> {
  const res = await gapiFetch(
    `${API}/${id}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
    { method: 'PUT', body: JSON.stringify({ values }) },
  )
  if (!res.ok) throw new Error(`Sheets write ${range}: ${res.status}`)
}

async function clearRange(id: string, range: string): Promise<void> {
  await gapiFetch(`${API}/${id}/values/${encodeURIComponent(range)}:clear`, {
    method: 'POST',
    body: '{}',
  })
}

async function readRange(id: string, range: string): Promise<string[][]> {
  const res = await gapiFetch(`${API}/${id}/values/${encodeURIComponent(range)}`)
  if (!res.ok) throw new Error(`Sheets read ${range}: ${res.status}`)
  const data = await res.json()
  return (data.values ?? []) as string[][]
}

/** Eksport wszystkich zadań i kategorii do arkusza (pełne nadpisanie). */
export async function exportToSheets(): Promise<void> {
  const id = await ensureSpreadsheet()
  const tasks = await db.tasks.toArray()
  const cats = await db.categories.toArray()

  const taskRows = tasks.map((t) => [
    t.id,
    t.title,
    t.notes ?? '',
    t.categoryId ?? '',
    t.status,
    t.createdAt,
    t.completedAt ?? '',
    t.dueDate ?? '',
    t.recurrenceRule ?? '',
    t.estimatedMinutes ?? '',
    t.order,
  ])
  const catRows = cats.map((c) => [c.id, c.name, c.color, c.order])

  await clearRange(id, 'Tasks!A:Z')
  await clearRange(id, 'Categories!A:Z')
  await writeRange(id, 'Tasks!A1', [TASK_HEADERS, ...taskRows])
  await writeRange(id, 'Categories!A1', [CAT_HEADERS, ...catRows])
}

/** Import z arkusza — upsert do Dexie po id. */
export async function importFromSheets(): Promise<void> {
  const id = useSettings.getState().sheetsId.trim()
  if (!id) throw new Error('Brak ID arkusza — najpierw wykonaj eksport.')

  const [taskRows, catRows] = await Promise.all([
    readRange(id, 'Tasks!A2:K'),
    readRange(id, 'Categories!A2:D'),
  ])

  const cats: Category[] = catRows
    .filter((r) => r[0])
    .map((r) => ({
      id: r[0],
      name: r[1] ?? '',
      color: r[2] || 'var(--cat-1)',
      order: Number(r[3]) || 0,
    }))

  const tasks: Task[] = taskRows
    .filter((r) => r[0])
    .map((r) => ({
      id: r[0],
      title: r[1] ?? '',
      notes: r[2] || undefined,
      categoryId: r[3] || undefined,
      status: (r[4] === 'done' ? 'done' : 'todo') as Task['status'],
      createdAt: r[5] || new Date().toISOString(),
      completedAt: r[6] || undefined,
      dueDate: r[7] || undefined,
      recurrenceRule: r[8] || undefined,
      estimatedMinutes: r[9] ? Number(r[9]) : undefined,
      order: Number(r[10]) || 0,
    }))

  await db.transaction('rw', db.tasks, db.categories, async () => {
    if (cats.length) await db.categories.bulkPut(cats)
    if (tasks.length) await db.tasks.bulkPut(tasks)
  })
}
