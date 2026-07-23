import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/dexie'
import type { Task } from '../db/types'
import { groupByDay } from '../lib/grouping'
import { fmtDayLabel } from '../lib/dates'
import TaskItem from '../components/tasks/TaskItem'
import TaskForm from '../components/tasks/TaskForm'
import CategoryManager from '../components/tasks/CategoryManager'
import Sheet from '../components/common/Sheet'

type Filter = 'todo' | 'done' | 'all'

export default function Tasks() {
  const [filter, setFilter] = useState<Filter>('todo')
  const tasks =
    useLiveQuery(async () => {
      const all = await db.tasks.toArray()
      return all.sort((a, b) => a.order - b.order)
    }, []) ?? []

  const [editing, setEditing] = useState<Task | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [showCats, setShowCats] = useState(false)

  const filtered = useMemo(
    () => tasks.filter((t) => (filter === 'all' ? true : t.status === filter)),
    [tasks, filter],
  )
  const groups = useMemo(() => groupByDay(filtered), [filtered])

  return (
    <div className="page">
      <div className="page-header">
        <h1>Wszystkie zadania</h1>
        <button className="btn" onClick={() => setShowCats(true)}>
          Kategorie
        </button>
      </div>

      <div className="row" role="tablist">
        {(['todo', 'done', 'all'] as Filter[]).map((f) => (
          <button
            key={f}
            className={`btn ${filter === f ? 'btn-primary' : ''}`}
            style={{ flex: 1 }}
            onClick={() => setFilter(f)}
          >
            {f === 'todo' ? 'Do zrobienia' : f === 'done' ? 'Zrobione' : 'Wszystkie'}
          </button>
        ))}
      </div>

      {groups.length === 0 && <p className="empty">Brak zadań w tym widoku.</p>}

      {groups.map((g) => (
        <section key={g.dateKey ?? 'none'} className="card">
          <div className="card-title">
            {g.dateKey ? fmtDayLabel(g.dateKey) : 'Bez terminu'}
            <span className="muted">{g.tasks.length}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 'var(--gap) var(--gap-lg) var(--gap-lg)' }}>
            {g.tasks.map((t) => (
              <TaskItem key={t.id} task={t} onEdit={setEditing} />
            ))}
          </div>
        </section>
      ))}

      <button className="btn btn-primary btn-block" onClick={() => setShowAdd(true)}>
        + Nowe zadanie
      </button>

      <Sheet open={showAdd} title="Nowe zadanie" onClose={() => setShowAdd(false)}>
        <TaskForm onDone={() => setShowAdd(false)} />
      </Sheet>
      <Sheet open={!!editing} title="Edytuj zadanie" onClose={() => setEditing(null)}>
        {editing && <TaskForm task={editing} onDone={() => setEditing(null)} />}
      </Sheet>
      <Sheet open={showCats} title="Kategorie" onClose={() => setShowCats(false)}>
        <CategoryManager />
      </Sheet>
    </div>
  )
}
