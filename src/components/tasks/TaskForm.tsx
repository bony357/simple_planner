import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/dexie'
import { addTask, deleteTask, updateTask } from '../../db/repo'
import type { Task } from '../../db/types'
import { RECURRENCE_PRESETS } from '../../services/recurrence'

interface TaskFormProps {
  task?: Task
  defaultDueDate?: string
  onDone: () => void
}

/** Formularz dodawania/edycji zadania — używany w bottom-sheet. */
export default function TaskForm({ task, defaultDueDate, onDone }: TaskFormProps) {
  const categories = useLiveQuery(
    () => db.categories.orderBy('order').toArray(),
    [],
    [],
  )

  const [title, setTitle] = useState(task?.title ?? '')
  const [categoryId, setCategoryId] = useState(task?.categoryId ?? '')
  const [notes, setNotes] = useState(task?.notes ?? '')
  const [dueDate, setDueDate] = useState(task?.dueDate ?? defaultDueDate ?? '')
  const [estimatedMinutes, setEstimatedMinutes] = useState(
    task?.estimatedMinutes ? String(task.estimatedMinutes) : '',
  )
  const [recurrenceRule, setRecurrenceRule] = useState(task?.recurrenceRule ?? '')

  const save = async () => {
    const t = title.trim()
    if (!t) return
    const payload = {
      title: t,
      categoryId: categoryId || undefined,
      notes: notes.trim() || undefined,
      dueDate: dueDate || undefined,
      estimatedMinutes: estimatedMinutes ? Number(estimatedMinutes) : undefined,
      recurrenceRule: recurrenceRule || undefined,
    }
    if (task) await updateTask(task.id, payload)
    else await addTask(payload)
    onDone()
  }

  return (
    <>
      <div className="field">
        <label>Tytuł</label>
        <input
          className="input"
          value={title}
          autoFocus
          placeholder="Co trzeba zrobić?"
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
        />
      </div>

      <div className="field">
        <label>Kategoria</label>
        <select
          className="select"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        >
          <option value="">— bez kategorii —</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="row">
        <div className="field" style={{ flex: 1 }}>
          <label>Termin (dzień)</label>
          <input
            className="input"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Czas (min)</label>
          <input
            className="input"
            type="number"
            inputMode="numeric"
            min={5}
            step={15}
            placeholder="np. 30"
            value={estimatedMinutes}
            onChange={(e) => setEstimatedMinutes(e.target.value)}
          />
        </div>
      </div>

      <div className="field">
        <label>Powtarzalność</label>
        <select
          className="select"
          value={recurrenceRule}
          onChange={(e) => setRecurrenceRule(e.target.value)}
        >
          {RECURRENCE_PRESETS.map((p) => (
            <option key={p.rule} value={p.rule}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label>Notatka</label>
        <textarea
          className="textarea"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <button className="btn btn-primary btn-block" onClick={save}>
        {task ? 'Zapisz zmiany' : 'Dodaj zadanie'}
      </button>

      {task && (
        <button
          className="btn btn-danger btn-block"
          onClick={async () => {
            await deleteTask(task.id)
            onDone()
          }}
        >
          Usuń zadanie
        </button>
      )}
    </>
  )
}
