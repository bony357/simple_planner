import { create } from 'zustand'

/**
 * Ulotny (nieperszystowany) status autoryzacji Google.
 * `authNeeded` = ostatnia próba cichego pobrania tokenu się nie powiodła,
 * więc operacje w tle są wstrzymane do czasu jawnego zalogowania.
 */
interface AuthStatus {
  authNeeded: boolean
  setAuthNeeded: (v: boolean) => void
}

export const useAuthStatus = create<AuthStatus>((set) => ({
  authNeeded: false,
  setAuthNeeded: (authNeeded) => set({ authNeeded }),
}))
