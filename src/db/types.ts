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
  /** Powiązanie z zadaniem w Google Tasks (dla sync). */
  googleTaskId?: string
  /** Stan synchronizacji z Google Tasks. */
  syncState?: SyncState
  /** ID wystąpienia wydarzenia Google, z którego zmaterializowano zadanie (dedup). */
  sourceEventId?: string
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
