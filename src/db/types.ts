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
  recurrenceRule?: string // reguła RRULE, np. "FREQ=MONTHLY;BYMONTHDAY=1"
  estimatedMinutes?: number
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
  syncState: SyncState
  updatedAt: string // ISO
}

export type ThemeName = 'color' | 'eink'
