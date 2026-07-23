import { useState } from 'react'
import { useAuthStatus } from '../../store/useAuthStatus'
import { getAccessToken } from '../../services/google/auth'
import { runSync } from '../../services/google/sync'
import { runTasksSync } from '../../services/google/tasksSync'
import { materializeCalendarTasks } from '../../services/tasksFromCalendar'
import styles from './AuthBanner.module.css'

/**
 * Pasek u góry ekranu widoczny, gdy synchronizacja w tle nie mogła pobrać
 * tokenu Google. Kliknięcie otwiera okno logowania i po sukcesie odświeża dane.
 */
export default function AuthBanner() {
  const authNeeded = useAuthStatus((s) => s.authNeeded)
  const [busy, setBusy] = useState(false)

  if (!authNeeded) return null

  const handleClick = async () => {
    if (busy) return
    setBusy(true)
    try {
      await getAccessToken(true) // jawne okno logowania Google
      // Po zalogowaniu odśwież dane; flaga authNeeded zniknie automatycznie.
      await materializeCalendarTasks().catch(() => {})
      await runSync(true).catch(() => {})
      await runTasksSync(true).catch(() => {})
    } catch {
      /* użytkownik zamknął okno lub błąd — pasek pozostaje widoczny */
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      className={styles.banner}
      onClick={handleClick}
      disabled={busy}
      aria-label="Zaloguj do Google, aby wznowić synchronizację"
    >
      <span className={styles.icon} aria-hidden>
        {busy ? '⏳' : '⚠️'}
      </span>
      <span className={styles.text}>
        {busy
          ? 'Logowanie…'
          : 'Synchronizacja wstrzymana — dotknij, aby zalogować do Google'}
      </span>
    </button>
  )
}
