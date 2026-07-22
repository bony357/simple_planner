import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/dexie'
import { deleteTemplate, updateTemplate } from '../db/repo'
import type { RecurringTemplate } from '../db/types'
import { describeRule, nextOccurrence } from '../services/recurrence'
import { materializeDueTasks } from '../services/recurring'
import { fmtShortDay, todayISO } from '../lib/dates'
import RecurringForm from '../components/recurring/RecurringForm'
import Sheet from '../components/common/Sheet'

export default function Recurring() {
  const templates =
    useLiveQuery(() => db.recurringTemplates.orderBy('order').toArray(), [], []) ?? []
  const categories =
    useLiveQuery(() => db.categories.orderBy('order').toArray(), [], []) ?? []

  const [editing, setEditing] = useState<RecurringTemplate | null>(null)
  const [showAdd, setShowAdd] = useState(false)

  const catName = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories],
  )

  return (
    <div className="page">
      <div className="page-header">
        <h1>Cykliczne</h1>
        <button className="btn" onClick={() => materializeDueTasks()}>
          Odśwież dziś
        </button>
      </div>

      <p className="muted" style={{ fontSize: 'var(--font-size-sm)' }}>
        Szablony zadań powtarzalnych — np. w dni robocze lub w określony dzień
        miesiąca. Aplikacja automatycznie dodaje je do listy to-do w dniu, na który
        wypadają.
      </p>

      {templates.length === 0 && (
        <p className="empty">
          Brak zadań cyklicznych. Dodaj pierwsze, np. „Rachunki — co miesiąc dnia 10".
        </p>
      )}

      {templates.map((t) => {
        const next = nextOccurrence(t.rule, todayISO())
        return (
          <section key={t.id} className="card">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--gap)',
                padding: 'var(--gap) var(--gap-lg)',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, opacity: t.active ? 1 : 0.5 }}>
                  {t.title}
                </div>
                <div className="muted" style={{ fontSize: 'var(--font-size-sm)' }}>
                  🔁 {describeRule(t.rule)}
                  {t.categoryId ? ` · ${catName.get(t.categoryId) ?? ''}` : ''}
                  {next ? ` · najbliżej: ${fmtShortDay(`${next}T00:00:00`)}` : ''}
                </div>
              </div>
              <button
                className={`btn ${t.active ? 'btn-primary' : ''}`}
                onClick={() => updateTemplate(t.id, { active: !t.active })}
                title={t.active ? 'Aktywne — kliknij, aby wstrzymać' : 'Wstrzymane'}
              >
                {t.active ? 'Aktywne' : 'Wstrzymane'}
              </button>
              <button className="btn btn-icon" onClick={() => setEditing(t)} aria-label="Edytuj">
                ✎
              </button>
            </div>
          </section>
        )
      })}

      <button className="btn btn-primary btn-block" onClick={() => setShowAdd(true)}>
        + Nowe zadanie cykliczne
      </button>

      <Sheet open={showAdd} title="Nowe zadanie cykliczne" onClose={() => setShowAdd(false)}>
        <RecurringForm onDone={() => setShowAdd(false)} />
      </Sheet>

      <Sheet
        open={!!editing}
        title="Edytuj zadanie cykliczne"
        onClose={() => setEditing(null)}
      >
        {editing && (
          <>
            <RecurringForm template={editing} onDone={() => setEditing(null)} />
            <button
              className="btn btn-danger btn-block"
              style={{ marginTop: 'var(--gap)' }}
              onClick={async () => {
                await deleteTemplate(editing.id)
                setEditing(null)
              }}
            >
              Usuń szablon
            </button>
          </>
        )}
      </Sheet>
    </div>
  )
}
