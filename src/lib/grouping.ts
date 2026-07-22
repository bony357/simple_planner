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
