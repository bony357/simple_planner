import { gapiFetch } from './auth'
import { useSettings } from '../../store/useSettings'

const API = 'https://tasks.googleapis.com/tasks/v1'

export interface GTask {
  id: string
  title?: string
  notes?: string
  status: 'needsAction' | 'completed'
  due?: string // RFC3339; Google Tasks bierze pod uwagę tylko datę
  completed?: string // RFC3339 timestamp ukończenia
  updated?: string
  deleted?: boolean
}

export interface TaskListInfo {
  id: string
  summary: string
}

/** Lista zadań docelowa (domyślnie główna @default). */
function taskListId(): string {
  return encodeURIComponent(useSettings.getState().taskListId || '@default')
}

/** Lista dostępnych list zadań konta — do wyboru w ustawieniach. */
export async function listTaskLists(): Promise<TaskListInfo[]> {
  const res = await gapiFetch(`${API}/users/@me/lists?maxResults=100`)
  if (!res.ok) throw new Error(`TaskLists: ${res.status}`)
  const data = await res.json()
  return ((data.items ?? []) as Record<string, unknown>[]).map((l) => ({
    id: String(l.id),
    summary: String(l.title ?? l.id),
  }))
}

/** Pobierz zadania z wybranej listy (łącznie z ukończonymi i ukrytymi). */
export async function listTasks(): Promise<GTask[]> {
  const params = new URLSearchParams({
    showCompleted: 'true',
    showHidden: 'true',
    maxResults: '100',
  })
  const res = await gapiFetch(`${API}/lists/${taskListId()}/tasks?${params}`)
  if (!res.ok) throw new Error(`Tasks list: ${res.status}`)
  const data = await res.json()
  return (data.items ?? []) as GTask[]
}

export interface TaskPayload {
  title: string
  notes?: string
  due?: string
  status?: 'needsAction' | 'completed'
  completed?: string
}

function buildBody(input: Partial<TaskPayload>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (input.title !== undefined) body.title = input.title
  if (input.notes !== undefined) body.notes = input.notes ?? ''
  if (input.due !== undefined) body.due = input.due
  if (input.status !== undefined) body.status = input.status
  // Google wymaga completed=null przy cofnięciu ukończenia.
  if (input.status === 'completed') body.completed = input.completed
  else if (input.status === 'needsAction') body.completed = null
  return body
}

export async function insertTask(input: TaskPayload): Promise<GTask> {
  const res = await gapiFetch(`${API}/lists/${taskListId()}/tasks`, {
    method: 'POST',
    body: JSON.stringify(buildBody(input)),
  })
  if (!res.ok) throw new Error(`Tasks insert: ${res.status}`)
  return res.json()
}

export async function patchTask(
  googleTaskId: string,
  input: Partial<TaskPayload>,
): Promise<void> {
  const res = await gapiFetch(
    `${API}/lists/${taskListId()}/tasks/${googleTaskId}`,
    { method: 'PATCH', body: JSON.stringify(buildBody(input)) },
  )
  if (!res.ok) throw new Error(`Tasks patch: ${res.status}`)
}

export async function removeTask(googleTaskId: string): Promise<void> {
  const res = await gapiFetch(
    `${API}/lists/${taskListId()}/tasks/${googleTaskId}`,
    { method: 'DELETE' },
  )
  // 404/410 = już nie istnieje — traktujemy jako sukces.
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`Tasks delete: ${res.status}`)
  }
}
