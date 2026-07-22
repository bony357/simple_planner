import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ThemeName } from '../db/types'

interface SettingsState {
  theme: ThemeName
  googleClientId: string
  geminiApiKey: string
  geminiModel: string
  calendarId: string
  sheetsId: string
  syncCalendar: boolean
  syncSheets: boolean
  lastSyncAt?: string

  setTheme: (t: ThemeName) => void
  update: (patch: Partial<SettingsState>) => void
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'color',
      googleClientId: '',
      geminiApiKey: '',
      geminiModel: 'gemini-2.5-flash',
      calendarId: 'primary',
      sheetsId: '',
      syncCalendar: false,
      syncSheets: false,

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
