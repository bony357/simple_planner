import { db, newId } from '../../db/dexie'
import { useSettings } from '../../store/useSettings'
import { getAccessToken } from './auth'
import {
  insertTask,
  listTasks,
  patchTask,
  removeTask,
  type TaskPayload,
} from './tasks'
import type { Category, Task } from '../../db/types'

let inFlight: Promise<TasksSyncResult | undefined> | null = null
let debounceTimer: ReturnType<typeof setTimeout> | null = null

export interface TasksSyncResult {
  pushed: number
  pulled: number
}

/**
 * Dwukierunkowa synchronizacja zadań to-do z Google Tasks.
 * Zasada local-first: najpierw wypychamy lokalne zmiany, potem pobieramy zdalne.
 * Gdy sync już trwa, kolejne wywołania dołączają do tej samej operacji.
 */
export async function runTasksSync(
  interactive = false,
): Promise<TasksSyncResult | undefined> {
  const { syncTasks, googleClientId } = useSettings.getState()
  if (!syncTasks || !googleClientId.trim()) return
  if (inFlight) return inFlight

  inFlight = (async () => {
    try {
      await getAccessToken(interactive)
      const cats = await db.categories.toArray()
      const pushed = await pushLocalTasks(cats)
      const pulled = await pullRemoteTasks(cats)
      useSettings.getState().update({
        lastTasksSyncAt: new Date().toISOString(),
        lastTasksSyncError: undefined,
      })
      return { pushed, pulled }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      console.error('[tasksSync] runTasksSync nieudany', e)
      useSettings.getState().update({ lastTasksSyncError: message })
      if (interactive) throw e
      return undefined
    } finally {
      inFlight = null
    }
  })()
  return inFlight
}

/** Zaplanuj synchronizację zadań w tle (debounce) po lokalnej zmianie. */
export function scheduleTasksSync(): void {
  if (!useSettings.getState().syncTasks) return
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    void runTasksSync(false)
  }, 1500)
}

/* ------------------------- Mapowanie kategorii ------------------------- */

/** Tytuł dla Google: prefiks [Kategoria] dla łatwej kategoryzacji. */
function encodeTitle(task: Task, cats: Category[]): string {
  const cat = cats.find((c) => c.id === task.categoryId)
  return cat ? `[${cat.name}] ${task.title}` : task.title
}

/** Odczyt prefiksu [Kategoria] z tytułu Google → {title, categoryId}. */
function decodeTitle(
  raw: string,
  cats: Category[],
): { title: string; categoryId?: string } {
  const m = raw.match(/^\[(.+?)\]\s+(.+)$/)
  if (m) {
    const cat = cats.find((c) => c.name.toLowerCase() === m[1].toLowerCase())
    if (cat) return { title: m[2], categoryId: cat.id }
  }
  return { title: raw }
}

/* --------------------------- Znacznik źródła --------------------------- */

/**
 * Ukryty znacznik dopisywany do notatek zadania w Google Tasks, dzięki któremu
 * id źródłowego wydarzenia kalendarza (`sourceEventId`) przetrwa round-trip
 * przez Google. Umożliwia to drugiemu urządzeniu rozpoznanie, że dane zadanie
 * zostało już zmaterializowane z kalendarza — i uniknięcie duplikatu.
 */
const SRC_MARKER_RE = /\n*\[planner:src=([^\]\n]+)\]\s*$/

/** Notatki do wysłania do Google: notatki użytkownika + ewentualny znacznik. */
function encodeNotes(task: Task): string | undefined {
  if (!task.sourceEventId) return task.notes
  const base = (task.notes ?? '').replace(SRC_MARKER_RE, '').trimEnd()
  const marker = `[planner:src=${task.sourceEventId}]`
  return base ? `${base}\n\n${marker}` : marker
}

/** Rozbij notatki Google na notatki użytkownika + `sourceEventId` (jeśli jest). */
function decodeNotes(raw?: string): {
  notes?: string
  sourceEventId?: string
} {
  if (!raw) return {}
  const m = raw.match(SRC_MARKER_RE)
  if (!m) return { notes: raw }
  const notes = raw.replace(SRC_MARKER_RE, '').trimEnd()
  return { notes: notes || undefined, sourceEventId: m[1] }
}

/* ---------------------------- Mapowanie pól ---------------------------- */

function dueFromDate(dueDate?: string): string | undefined {
  return dueDate ? `${dueDate}T00:00:00.000Z` : undefined
}

function dateFromDue(due?: string): string | undefined {
  return due ? due.slice(0, 10) : undefined
}

function payloadFor(task: Task, cats: Category[]): TaskPayload {
  return {
    title: encodeTitle(task, cats),
    notes: encodeNotes(task),
    due: dueFromDate(task.dueDate),
    status: task.status === 'done' ? 'completed' : 'needsAction',
    completed: task.completedAt,
  }
}

/* ------------------------------- Push -------------------------------- */

async function pushLocalTasks(cats: Category[]): Promise<number> {
  const pending = await db.tasks
    .where('syncState')
    .anyOf('pending', 'deleted')
    .toArray()
  let count = 0
  let firstError: unknown = null

  for (const t of pending) {
    try {
      if (t.syncState === 'deleted') {
        if (t.googleTaskId) await removeTask(t.googleTaskId)
        await db.tasks.delete(t.id)
        count++
        continue
      }
      // pending
      if (t.googleTaskId) {
        await patchTask(t.googleTaskId, payloadFor(t, cats))
      } else {
        const created = await insertTask(payloadFor(t, cats))
        await db.tasks.update(t.id, { googleTaskId: created.id })
      }
      await db.tasks.update(t.id, { syncState: 'synced' })
      count++
    } catch (e) {
      console.error('[tasksSync] push nieudany dla zadania', t.id, t.title, e)
      if (!firstError) firstError = e
    }
  }
  if (count === 0 && firstError) throw firstError
  return count
}

/* ------------------------------- Pull -------------------------------- */

/**
 * Znajdź lokalne zadanie reprezentujące ten sam element co rekord Google, ale
 * bez dowiązania `googleTaskId`. Zapobiega duplikatom przy synchronizacji tego
 * samego konta na wielu urządzeniach:
 *   1. po `sourceEventId` (opcja 1) — zadania zmaterializowane z kalendarza,
 *   2. po tytule + terminie (opcja 3) — to samo zadanie wpisane ręcznie na
 *      dwóch urządzeniach, zanim którekolwiek zsynchronizowało.
 * Dopasowujemy wyłącznie zadania bez `googleTaskId`, by nie „przejąć" zadania
 * już powiązanego z innym rekordem Google.
 */
async function findAdoptableLocal(
  sourceEventId: string | undefined,
  title: string,
  dueDate: string | undefined,
): Promise<Task | undefined> {
  if (sourceEventId) {
    const bySrc = await db.tasks
      .where('sourceEventId')
      .equals(sourceEventId)
      .filter((t) => !t.googleTaskId)
      .first()
    if (bySrc) return bySrc
  }
  return db.tasks
    .filter((t) => !t.googleTaskId && t.title === title && t.dueDate === dueDate)
    .first()
}

async function pullRemoteTasks(cats: Category[]): Promise<number> {
  const remote = await listTasks()
  const remoteIds = new Set<string>()
  let pulled = 0

  // Kolejny wolny `order` dla nowych zadań.
  let nextOrder =
    (await db.tasks.toArray()).reduce((m, t) => Math.max(m, t.order), -1) + 1

  for (const r of remote) {
    if (r.deleted) continue
    remoteIds.add(r.id)
    const { title, categoryId } = decodeTitle(r.title ?? '(bez tytułu)', cats)
    const { notes, sourceEventId } = decodeNotes(r.notes)
    const status = r.status === 'completed' ? 'done' : 'todo'
    const dueDate = dateFromDue(r.due)

    const existing = await db.tasks.where('googleTaskId').equals(r.id).first()
    if (existing) {
      // Local-first: nie nadpisujemy lokalnych zmian oczekujących na push.
      if (existing.syncState === 'synced') {
        await db.tasks.update(existing.id, {
          title,
          categoryId,
          status,
          completedAt: r.completed,
          dueDate,
          notes,
          // Uzupełnij znacznik źródłowy, jeśli lokalnie go brak (dedup na przyszłość).
          sourceEventId: existing.sourceEventId ?? sourceEventId,
        })
      }
      continue
    }

    // Brak dowiązania po googleTaskId → zanim utworzymy nowy rekord, spróbuj
    // dowiązać istniejące lokalne zadanie (dedup wielourządzeniowy).
    const adopt = await findAdoptableLocal(sourceEventId, title, dueDate)
    if (adopt) {
      const patch: Partial<Task> = { googleTaskId: r.id }
      if (sourceEventId && !adopt.sourceEventId) patch.sourceEventId = sourceEventId
      // Local-first: gdy lokalna kopia ma niewypchnięte zmiany, zachowujemy jej
      // treść — dowiązujemy tylko id, a najbliższy push wyśle wersję lokalną.
      // (Zadanie bez googleTaskId jest z natury `pending`, więc zwykle tędy.)
      if (adopt.syncState !== 'pending') {
        patch.title = title
        patch.categoryId = categoryId
        patch.status = status
        patch.completedAt = r.completed
        patch.dueDate = dueDate
        patch.notes = notes
        patch.syncState = 'synced'
      }
      await db.tasks.update(adopt.id, patch)
      continue
    }

    const task: Task = {
      id: newId(),
      title,
      notes,
      categoryId,
      status,
      createdAt: new Date().toISOString(),
      completedAt: r.completed,
      dueDate,
      googleTaskId: r.id,
      sourceEventId,
      syncState: 'synced',
      order: nextOrder++,
    }
    await db.tasks.add(task)
    pulled++
  }

  // Usuń lokalne kopie zadań Google, które zniknęły zdalnie.
  const localGoogle = await db.tasks.where('syncState').equals('synced').toArray()
  for (const t of localGoogle) {
    if (t.googleTaskId && !remoteIds.has(t.googleTaskId)) {
      await db.tasks.delete(t.id)
    }
  }
  return pulled
}
