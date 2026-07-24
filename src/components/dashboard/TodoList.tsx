import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/dexie'
import { addTask, updateTask } from '../../db/repo'
import type { Task } from '../../db/types'
import { fmtDate, fmtTime, todayISO } from '../../lib/dates'
import { groupByCategory, groupByDay } from '../../lib/grouping'
import TaskItem from '../tasks/TaskItem'
import TaskForm from '../tasks/TaskForm'
import Sheet from '../common/Sheet'
import styles from './TodoList.module.css'

export default function TodoList() {
  const today = todayISO()
  const categories =
    useLiveQuery(() => db.categories.orderBy('order').toArray(), [], []) ?? []

  // Zadania „na dziś": todo bez terminu lub z terminem == dziś.
  const tasks =
    useLiveQuery(async () => {
      const all = await db.tasks.where('status').equals('todo').toArray()
      return all
        .filter((t) => !t.dueDate || t.dueDate === today)
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

  // Godziny rozpoczęcia zadań z kalendarza: wg powiązania taskId (przeciągnięte)
  // lub googleEventId == sourceEventId (zmaterializowane z kalendarza).
  const events =
    useLiveQuery(() => db.events.toArray(), [], []) ?? []
  const { startByTask, startByGoogleEvent } = useMemo(() => {
    const startByTask = new Map<string, string>()
    const startByGoogleEvent = new Map<string, string>()
    for (const e of events) {
      if (e.syncState === 'deleted') continue
      if (e.taskId) {
        const cur = startByTask.get(e.taskId)
        if (!cur || e.start < cur) startByTask.set(e.taskId, e.start)
      }
      if (e.googleEventId) {
        const cur = startByGoogleEvent.get(e.googleEventId)
        if (!cur || e.start < cur) startByGoogleEvent.set(e.googleEventId, e.start)
      }
    }
    return { startByTask, startByGoogleEvent }
  }, [events])

  const startFor = (t: Task): string | undefined =>
    startByTask.get(t.id) ??
    (t.sourceEventId ? startByGoogleEvent.get(t.sourceEventId) : undefined)

  const catById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  )
  // Grupy wg kategorii; wewnątrz sortuj po godzinie rozpoczęcia, bez godziny na końcu.
  const groups = useMemo(
    () =>
      groupByCategory(tasks, categories).map((g) => ({
        ...g,
        tasks: [...g.tasks].sort((a, b) => {
          const sa = startFor(a)
          const sb = startFor(b)
          if (sa && sb) return sa < sb ? -1 : sa > sb ? 1 : 0
          if (sa) return -1
          if (sb) return 1
          return a.order - b.order
        }),
      })),
    [tasks, categories, startByTask, startByGoogleEvent],
  )

  const overdueGroups = useMemo(() => groupByDay(overdue), [overdue])
  const upcomingGroups = useMemo(() => groupByDay(upcoming), [upcoming])

  const quickAdd = async () => {
    const t = quick.trim()
    if (!t) return
    await addTask({ title: t, dueDate: today })
    setQuick('')
  }

  const [pickingIds, setPickingIds] = useState<Set<string>>(new Set())

  const pickOverdue = async (task: Task) => {
    setPickingIds((prev) => new Set(prev).add(task.id))
    await updateTask(task.id, { dueDate: today })
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
                  startTime={(() => {
                    const s = startFor(t)
                    return s ? fmtTime(s) : undefined
                  })()}
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
          {overdueGroups.map((grp) => (
            <div key={grp.dateKey} className={styles.dayGroup}>
              <div className={styles.dayHeading}>{fmtDate(grp.dateKey!)}</div>
              {grp.tasks.map((t) => (
                <div key={t.id} className="row">
                  <div style={{ flex: 1 }}>
                    <TaskItem
                      task={t}
                      category={
                        t.categoryId ? catById.get(t.categoryId) : undefined
                      }
                    />
                  </div>
                  <button
                    className="btn btn-primary"
                    disabled={pickingIds.has(t.id)}
                    onClick={() => pickOverdue(t)}
                  >
                    {pickingIds.has(t.id) ? '✓ Dodano' : 'Na dziś'}
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className={styles.sheetSection}>
          <div className={styles.sheetHeading}>Nadchodzące (do 14 dni)</div>
          {upcoming.length === 0 && (
            <p className="empty">Brak nadchodzących zadań</p>
          )}
          {upcomingGroups.map((grp) => (
            <div key={grp.dateKey} className={styles.dayGroup}>
              <div className={styles.dayHeading}>{fmtDate(grp.dateKey!)}</div>
              {grp.tasks.map((t) => (
                <div key={t.id} className="row">
                  <div style={{ flex: 1 }}>
                    <TaskItem
                      task={t}
                      category={
                        t.categoryId ? catById.get(t.categoryId) : undefined
                      }
                    />
                  </div>
                  <button
                    className="btn btn-primary"
                    disabled={pickingIds.has(t.id)}
                    onClick={() => pickOverdue(t)}
                  >
                    {pickingIds.has(t.id) ? '✓ Dodano' : 'Na dziś'}
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      </Sheet>
    </section>
  )
}
