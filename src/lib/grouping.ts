import type { Category, Task } from '../db/types'

export interface TaskGroup {
  category?: Category
  tasks: Task[]
}

/** Grupuje zadania wg kategorii, zachowując kolejność kategorii; „bez kategorii" na końcu. */
export function groupByCategory(tasks: Task[], categories: Category[]): TaskGroup[] {
  const byId = new Map(categories.map((c) => [c.id, c]))
  const groups = new Map<string, TaskGroup>()
  for (const c of categories) groups.set(c.id, { category: c, tasks: [] })
  groups.set('__none__', { category: undefined, tasks: [] })
  for (const t of tasks) {
    const key = t.categoryId && byId.has(t.categoryId) ? t.categoryId : '__none__'
    groups.get(key)!.tasks.push(t)
  }
  return [...groups.values()].filter((g) => g.tasks.length > 0)
}

export interface DayGroup {
  /** YYYY-MM-DD; brak = zadania bez terminu. */
  dateKey?: string
  tasks: Task[]
}

/** Grupuje zadania wg dnia (rosnąco); zadania bez terminu na końcu. */
export function groupByDay(tasks: Task[]): DayGroup[] {
  const byDay = new Map<string, Task[]>()
  const undated: Task[] = []
  for (const t of tasks) {
    if (t.dueDate) {
      if (!byDay.has(t.dueDate)) byDay.set(t.dueDate, [])
      byDay.get(t.dueDate)!.push(t)
    } else {
      undated.push(t)
    }
  }
  const groups: DayGroup[] = [...byDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([dateKey, ts]) => ({
      dateKey,
      tasks: ts.sort((a, b) => a.order - b.order),
    }))
  if (undated.length) {
    groups.push({ tasks: undated.sort((a, b) => a.order - b.order) })
  }
  return groups
}
