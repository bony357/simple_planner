import { useState } from 'react'
import { askAssistant, type AssistantResult, type Suggestion } from '../../services/gemini'
import { db } from '../../db/dexie'
import { addTask, updateTask } from '../../db/repo'
import type { Task } from '../../db/types'
import { useSettings } from '../../store/useSettings'
import styles from './AssistantPanel.module.css'

interface AssistantPanelProps {
  onClose: () => void
}

const ACTION_LABEL: Record<Suggestion['action'], string> = {
  addTask: 'Dodaj zadanie',
  modifyTask: 'Zmień zadanie',
  completeTask: 'Oznacz jako zrobione',
  remindRecurring: 'Przypomnienie (cykliczne)',
}

export default function AssistantPanel({ onClose }: AssistantPanelProps) {
  const hasKey = useSettings((s) => !!s.geminiApiKey.trim())
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<AssistantResult | null>(null)
  const [applied, setApplied] = useState<Set<number>>(new Set())

  const run = async () => {
    setLoading(true)
    setError(null)
    setApplied(new Set())
    try {
      setResult(await askAssistant(prompt.trim() || undefined))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd asystenta')
    } finally {
      setLoading(false)
    }
  }

  const apply = async (s: Suggestion, i: number) => {
    await applySuggestion(s)
    setApplied((prev) => new Set(prev).add(i))
  }

  if (!hasKey) {
    return (
      <p className="empty">
        Aby korzystać z asystenta, dodaj klucz Gemini API w Ustawieniach.
      </p>
    )
  }

  return (
    <div className={styles.panel}>
      <div className="field">
        <label>Możesz dopisać prośbę (opcjonalnie)</label>
        <textarea
          className="textarea"
          placeholder="np. Zaplanuj lekki dzień, pamiętaj o rachunkach…"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
      </div>
      <button className="btn btn-primary btn-block" onClick={run} disabled={loading}>
        {loading ? 'Analizuję…' : '✨ Poproś o sugestie'}
      </button>

      {error && <p className={styles.error}>{error}</p>}

      {result && (
        <div className={styles.results}>
          {result.summary && <p className={styles.summary}>{result.summary}</p>}
          {result.suggestions.length === 0 && (
            <p className="muted">Brak sugestii — wszystko wygląda dobrze.</p>
          )}
          {result.suggestions.map((s, i) => (
            <div key={i} className={styles.suggestion}>
              <div className={styles.sugHead}>
                <span className={styles.badge}>{ACTION_LABEL[s.action]}</span>
                <span className={styles.sugTitle}>{s.title}</span>
              </div>
              <p className={styles.reason}>{s.reason}</p>
              {applied.has(i) ? (
                <span className={styles.done}>✓ Dodano</span>
              ) : (
                <button className="btn" onClick={() => apply(s, i)}>
                  Zastosuj
                </button>
              )}
            </div>
          ))}
          <button className="btn btn-block" onClick={onClose}>
            Zamknij
          </button>
        </div>
      )}
    </div>
  )
}

/** Zastosuj pojedynczą sugestię do bazy (po akceptacji użytkownika). */
async function applySuggestion(s: Suggestion): Promise<void> {
  const categoryId = s.categoryName
    ? (await db.categories.filter((c) => c.name === s.categoryName).first())?.id
    : undefined

  switch (s.action) {
    case 'addTask':
    case 'remindRecurring':
      await addTask({
        title: s.title,
        notes: s.notes,
        dueDate: s.dueDate,
        categoryId,
      })
      break
    case 'modifyTask':
      if (s.taskId) {
        const patch: Partial<Task> = {}
        if (s.title) patch.title = s.title
        if (s.notes) patch.notes = s.notes
        if (s.dueDate) patch.dueDate = s.dueDate
        if (categoryId) patch.categoryId = categoryId
        await updateTask(s.taskId, patch)
      }
      break
    case 'completeTask':
      if (s.taskId) {
        await updateTask(s.taskId, {
          status: 'done',
          completedAt: new Date().toISOString(),
        })
      }
      break
  }
}
