export type TaskStatus = 'todo' | 'done'

export interface Task {
  id: string
  title: string
  notes?: string
  categoryId?: string
  status: TaskStatus
  createdAt: string // ISO
  completedAt?: string // ISO
  dueDate?: string // ISO date (YYYY-MM-DD) — na kiedy zaplanowane
  recurrenceRule?: string // reguła RRULE (starsze zadania; nowe używają szablonów)
  templateId?: string // powiązanie z szablonem cyklicznym (dla instancji)
  estimatedMinutes?: number
  order: number
}

/** Szablon zadania cyklicznego — „wydzielone" źródło powtarzalnych zadań. */
export interface RecurringTemplate {
  id: string
  title: string
  notes?: string
  categoryId?: string
  estimatedMinutes?: number
  rule: string // RRULE, np. "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"
  active: boolean
  lastMaterializedDate?: string // YYYY-MM-DD — do której daty utworzono instancje
  order: number
}

export interface Category {
  id: string
  name: string
  color: string
  order: number
}

export type EventSource = 'local' | 'google'
export type SyncState = 'synced' | 'pending' | 'deleted'

export interface CalendarEvent {
  id: string
  taskId?: string
  title: string
  start: string // ISO datetime
  end: string // ISO datetime
  color?: string
  source: EventSource
  googleEventId?: string
  /** Kalendarz Google, z którego pochodzi wydarzenie (dla źródeł google). */
  calendarId?: string
  /** true = tylko podgląd (kalendarz inny niż wybrany do zapisu). */
  readOnly?: boolean
  syncState: SyncState
  updatedAt: string // ISO
}

/** Metadane kalendarza Google (do wyboru w ustawieniach). */
export interface CalendarInfo {
  id: string
  summary: string
  primary?: boolean
  accessRole?: string
  backgroundColor?: string
}

export type ThemeName = 'color' | 'eink'
