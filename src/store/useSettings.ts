import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CalendarInfo, ThemeName } from '../db/types'
import type { TaskListInfo } from '../services/google/tasks'

interface SettingsState {
  theme: ThemeName
  googleClientId: string
  geminiApiKey: string
  geminiModel: string
  /** Kalendarz, do którego zapisujemy (jedyny zapisywalny). */
  calendarId: string
  /** Dodatkowe kalendarze pokazywane tylko do podglądu. */
  readCalendarIds: string[]
  /** Pobrana lista kalendarzy konta (do wyboru w UI). */
  availableCalendars: CalendarInfo[]
  syncCalendar: boolean
  lastSyncAt?: string
  lastSyncError?: string
  /** Synchronizacja zadań to-do z Google Tasks. */
  syncTasks: boolean
  /** Lista zadań Google, do której synchronizujemy (domyślnie główna). */
  taskListId: string
  /** Pobrana lista list zadań konta (do wyboru w UI). */
  availableTaskLists: TaskListInfo[]
  /** Kalendarz źródłowy „cyklicznych": jego wydarzenia stają się zadaniami dnia. */
  taskCalendarId: string
  /** YYYY-MM-DD — do której daty zmaterializowano zadania z kalendarza. */
  lastTaskMaterializeDate?: string
  lastTasksSyncAt?: string
  lastTasksSyncError?: string

  setTheme: (t: ThemeName) => void
  update: (patch: Partial<SettingsState>) => void
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'color',
      googleClientId: '',
      geminiApiKey: '',
      geminiModel: 'gemini-flash-latest',
      calendarId: 'primary',
      readCalendarIds: [],
      availableCalendars: [],
      syncCalendar: false,
      syncTasks: false,
      taskListId: '@default',
      availableTaskLists: [],
      taskCalendarId: '',

      setTheme: (theme) => {
        set({ theme })
        document.documentElement.setAttribute('data-theme', theme)
      },
      update: (patch) => set(patch),
    }),
    {
      name: 'planner-settings',
      // Nie zapisujemy funkcji — persist domyślnie serializuje cały stan,
      // ale funkcje i tak są pomijane przez JSON.
    },
  ),
)

/** Zastosuj zapisany motyw przy starcie (spójnie ze skryptem w index.html). */
export function applyStoredTheme(): void {
  const theme = useSettings.getState().theme
  document.documentElement.setAttribute('data-theme', theme)
}
