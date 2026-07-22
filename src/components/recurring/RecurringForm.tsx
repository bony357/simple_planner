import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/dexie'
import { addTemplate, updateTemplate } from '../../db/repo'
import { materializeDueTasks } from '../../services/recurring'
import type { RecurringTemplate } from '../../db/types'
import {
  DEFAULT_SPEC,
  WEEKDAYS,
  buildRule,
  parseRule,
  type RecurrenceKind,
} from '../../services/recurrence'

interface RecurringFormProps {
  template?: RecurringTemplate
  onDone: () => void
}

const KIND_OPTIONS: { value: RecurrenceKind; label: string }[] = [
  { value: 'daily', label: 'Codziennie' },
  { value: 'weekdays', label: 'W dni robocze (pon–pt)' },
  { value: 'weekly', label: 'Wybrane dni tygodnia' },
  { value: 'monthly', label: 'Określony dzień miesiąca' },
]

export default function RecurringForm({ template, onDone }: RecurringFormProps) {
  const categories =
    useLiveQuery(() => db.categories.orderBy('order').toArray(), [], []) ?? []

  const initial = template ? parseRule(template.rule) : DEFAULT_SPEC
  const [title, setTitle] = useState(template?.title ?? '')
  const [categoryId, setCategoryId] = useState(template?.categoryId ?? '')
  const [estimatedMinutes, setEstimatedMinutes] = useState(
    template?.estimatedMinutes ? String(template.estimatedMinutes) : '',
  )
  const [kind, setKind] = useState<RecurrenceKind>(initial.kind)
  const [weekdays, setWeekdays] = useState<string[]>(initial.weekdays)
  const [monthDay, setMonthDay] = useState<number>(initial.monthDay)

  const toggleDay = (code: string) =>
    setWeekdays((prev) =>
      prev.includes(code) ? prev.filter((d) => d !== code) : [...prev, code],
    )

  const save = async () => {
    const t = title.trim()
    if (!t) return
    const rule = buildRule({ kind, weekdays, monthDay })
    const payload = {
      title: t,
      categoryId: categoryId || undefined,
      estimatedMinutes: estimatedMinutes ? Number(estimatedMinutes) : undefined,
      rule,
    }
    if (template) await updateTemplate(template.id, payload)
    else await addTemplate(payload)
    // Utwórz od razu dzisiejszą instancję, jeśli reguła wypada dziś.
    await materializeDueTasks()
    onDone()
  }

  return (
    <>
      <div className="field">
        <label>Nazwa</label>
        <input
          className="input"
          autoFocus
          placeholder="np. Zapłać rachunki, Wywieź śmieci…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div className="row">
        <div className="field" style={{ flex: 1 }}>
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
          value={kind}
          onChange={(e) => setKind(e.target.value as RecurrenceKind)}
        >
          {KIND_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {kind === 'weekly' && (
        <div className="field">
          <label>Dni tygodnia</label>
          <div className="row row-wrap">
            {WEEKDAYS.map((w) => (
              <button
                key={w.code}
                className={`btn ${weekdays.includes(w.code) ? 'btn-primary' : ''}`}
                style={{ minWidth: 56, padding: '0 10px' }}
                onClick={() => toggleDay(w.code)}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {kind === 'monthly' && (
        <div className="field">
          <label>Dzień miesiąca (1–31, lub -1 = ostatni)</label>
          <input
            className="input"
            type="number"
            inputMode="numeric"
            min={-1}
            max={31}
            value={monthDay}
            onChange={(e) => setMonthDay(Number(e.target.value) || 1)}
          />
        </div>
      )}

      <button className="btn btn-primary btn-block" onClick={save}>
        {template ? 'Zapisz zmiany' : 'Dodaj zadanie cykliczne'}
      </button>
    </>
  )
}
