import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/dexie'
import { addTask, updateTask } from '../../db/repo'
import type { Task } from '../../db/types'
import { fmtDate, todayISO } from '../../lib/dates'
import { groupByCategory } from '../../lib/grouping'
import TaskItem from '../tasks/TaskItem'
import TaskForm from '../tasks/TaskForm'
import Sheet from '../common/Sheet'
import styles from './TodoList.module.css'

export default function TodoList() {
  const today = todayISO()
  const categories =
    useLiveQuery(() => db.categories.orderBy('order').toArray(), [], []) ?? []

  // Zadania „na dziś": todo bez terminu lub z terminem <= dziś.
  const tasks =
    useLiveQuery(async () => {
      const all = await db.tasks.where('status').equals('todo').toArray()
      return all
        .filter((t) => !t.dueDate || t.dueDate <= today)
        .sort((a, b) => a.order - b.order)
    }, [today]) ?? []

  // Zaległe z poprzednich dni (do wyboru w arkuszu).
  const overdue =
    useLiveQuery(async () => {
      const all = await db.tasks.where('status').equals('todo').toArray()
      return all
        .filter((t) => t.dueDate && t.dueDate < today)
        .sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : 1))
    }, [today]) ?? []

  // Nadchodzące: zadania z terminem po dziś (m.in. zmaterializowane z kalendarza).
  const upcoming =
    useLiveQuery(async () => {
      const all = await db.tasks.where('status').equals('todo').toArray()
      return all
        .filter((t) => t.dueDate && t.dueDate > today)
        .sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : 1))
    }, [today]) ?? []

  const [quick, setQuick] = useState('')
  const [editing, setEditing] = useState<Task | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [showOverdue, setShowOverdue] = useState(false)

  const catById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  )
  const groups = useMemo(
    () => groupByCategory(tasks, categories),
    [tasks, categories],
  )

  const quickAdd = async () => {
    const t = quick.trim()
    if (!t) return
    await addTask({ title: t, dueDate: today })
    setQuick('')
  }

  const pickOverdue = async (task: Task) => {
    await updateTask(task.id, { dueDate: today })
    setShowOverdue(false)
  }

  return (
    <section className={`card ${styles.panel}`}>
      <div className="card-title">
        Lista to-do
        <button
          className="btn btn-icon"
          aria-label="Zaległe i nadchodzące zadania"
          onClick={() => setShowOverdue(true)}
        >
          🗓{overdue.length > 0 ? <sup>{overdue.length}</sup> : null}
        </button>
      </div>

      <div className={styles.quick}>
        <input
          className="input"
          placeholder="Szybko dodaj zadanie…"
          value={quick}
          onChange={(e) => setQuick(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && quickAdd()}
        />
        <button className="btn btn-primary" onClick={quickAdd}>
          Dodaj
        </button>
      </div>

      <div className={styles.groups}>
        {groups.length === 0 && (
          <p className="empty">Brak zadań na dziś. Dodaj coś powyżej 👆</p>
        )}
        {groups.map((g) => (
          <div key={g.category?.id ?? 'none'} className={styles.group}>
            <div className={styles.groupTitle}>
              {g.category ? (
                <>
                  <span
                    className={styles.groupDot}
                    style={{ background: g.category.color }}
                  />
                  {g.category.name}
                </>
              ) : (
                'Bez kategorii'
              )}
            </div>
            <div className={styles.list}>
              {g.tasks.map((t) => (
                <TaskItem
                  key={t.id}
                  task={t}
                  category={t.categoryId ? catById.get(t.categoryId) : undefined}
                  onEdit={setEditing}
                  draggable
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <button
        className="btn btn-block"
        style={{ margin: 'var(--gap) var(--gap-lg) var(--gap-lg)', width: 'auto' }}
        onClick={() => setShowAdd(true)}
      >
        + Nowe zadanie (ze szczegółami)
      </button>

      <Sheet open={showAdd} title="Nowe zadanie" onClose={() => setShowAdd(false)}>
        <TaskForm defaultDueDate={today} onDone={() => setShowAdd(false)} />
      </Sheet>

      <Sheet
        open={!!editing}
        title="Edytuj zadanie"
        onClose={() => setEditing(null)}
      >
        {editing && <TaskForm task={editing} onDone={() => setEditing(null)} />}
      </Sheet>

      <Sheet
        open={showOverdue}
        title="Zaległe i nadchodzące"
        onClose={() => setShowOverdue(false)}
      >
        <div className={styles.sheetSection}>
          <div className={styles.sheetHeading}>Niedokończone z poprzednich dni</div>
          {overdue.length === 0 && <p className="empty">Nic zaległego 🎉</p>}
          {overdue.map((t) => (
            <div key={t.id} className="row">
              <div style={{ flex: 1 }}>
                <TaskItem
                  task={t}
                  category={t.categoryId ? catById.get(t.categoryId) : undefined}
                />
                <span className={styles.due}>{fmtDate(t.dueDate!)}</span>
              </div>
              <button className="btn btn-primary" onClick={() => pickOverdue(t)}>
                Na dziś
              </button>
            </div>
          ))}
        </div>

        <div className={styles.sheetSection}>
          <div className={styles.sheetHeading}>Nadchodzące (do 14 dni)</div>
          {upcoming.length === 0 && (
            <p className="empty">Brak nadchodzących zadań</p>
          )}
          {upcoming.map((t) => (
            <div key={t.id} className="row">
              <div style={{ flex: 1 }}>
                <TaskItem
                  task={t}
                  category={t.categoryId ? catById.get(t.categoryId) : undefined}
                />
                <span className={styles.due}>{fmtDate(t.dueDate!)}</span>
              </div>
              <button className="btn btn-primary" onClick={() => pickOverdue(t)}>
                Na dziś
              </button>
            </div>
          ))}
        </div>
      </Sheet>
    </section>
  )
}
