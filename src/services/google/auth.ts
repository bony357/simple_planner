import { useSettings } from '../../store/useSettings'
import { useAuthStatus } from '../../store/useAuthStatus'

// Minimalne typy dla Google Identity Services (ładowane ze skryptu).
interface TokenResponse {
  access_token: string
  expires_in: number
  error?: string
}
interface TokenErrorResponse {
  type?: string
  message?: string
}
interface TokenClient {
  requestAccessToken: (opts?: { prompt?: string }) => void
  callback: (resp: TokenResponse) => void
}
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string
            scope: string
            login_hint?: string
            callback: (resp: TokenResponse) => void
            error_callback?: (err: TokenErrorResponse) => void
          }) => TokenClient
        }
      }
    }
  }
}

export const GOOGLE_SCOPES = [
  // events → zapis/edycja wydarzeń w kalendarzu zapisu
  'https://www.googleapis.com/auth/calendar.events',
  // readonly → lista kalendarzy (calendarList) + podgląd wydarzeń z innych kalendarzy
  'https://www.googleapis.com/auth/calendar.readonly',
  // tasks → dwukierunkowa synchronizacja z Listą zadań Google
  'https://www.googleapis.com/auth/tasks',
].join(' ')

const GIS_SRC = 'https://accounts.google.com/gsi/client'
const TOKEN_STORAGE_KEY = 'planner-google-token'
const HINT_STORAGE_KEY = 'planner-google-login-hint'
// Odświeżamy token z wyprzedzeniem, zanim wygaśnie (żeby sync nie trafił na lukę).
const REFRESH_AHEAD_MS = 5 * 60 * 1000

let gisReady: Promise<void> | null = null
let tokenClient: TokenClient | null = null
let accessToken: string | null = null
let tokenExpiry = 0
let refreshTimer: ReturnType<typeof setTimeout> | null = null
// Adres konta Google — podawany jako login_hint. Bez niego ciche odnowienie
// (prompt:'none') przy kilku zalogowanych kontach kończy się
// „interaction_required" i wymusza ręczne logowanie co godzinę.
let loginHint: string | null = null
// Jedno wspólne, ciche (nieinteraktywne) żądanie tokenu „w locie". Przy
// starcie/odświeżeniu wiele modułów naraz (sync kalendarza, sync zadań,
// materializacja) prosi o token — bez łączenia każde tworzyłoby osobnego
// klienta GIS i osobno migało oknem logowania.
let silentRequest: Promise<string> | null = null

/**
 * Odczyt/zapis tokenu w localStorage — dzięki temu przeładowanie strony lub
 * ponowne otwarcie PWA nie wymusza kolejnego logowania (token Google żyje ~1h).
 * Trzymamy tylko krótkotrwały access token, nie refresh token.
 */
function loadStoredToken(): void {
  try {
    const raw = localStorage.getItem(TOKEN_STORAGE_KEY)
    if (!raw) return
    const { token, expiry } = JSON.parse(raw) as { token: string; expiry: number }
    if (token && typeof expiry === 'number' && Date.now() < expiry) {
      accessToken = token
      tokenExpiry = expiry
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY)
    }
  } catch {
    /* brak/niepoprawny wpis — ignorujemy */
  }
}

function persistToken(): void {
  try {
    localStorage.setItem(
      TOKEN_STORAGE_KEY,
      JSON.stringify({ token: accessToken, expiry: tokenExpiry }),
    )
  } catch {
    /* prywatny tryb / brak miejsca — działamy dalej bez trwałości */
  }
}

function loadStoredHint(): void {
  try {
    loginHint = localStorage.getItem(HINT_STORAGE_KEY)
  } catch {
    /* ignorujemy */
  }
}

/**
 * Jednorazowo ustala adres konta (id kalendarza głównego = e-mail konta),
 * żeby kolejne ciche odnowienia trafiały we właściwe konto bez interakcji.
 */
async function rememberLoginHint(token: string): Promise<void> {
  if (loginHint) return
  try {
    const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return
    const { id } = (await res.json()) as { id?: string }
    if (!id || !id.includes('@')) return
    loginHint = id
    localStorage.setItem(HINT_STORAGE_KEY, id)
  } catch {
    /* brak podpowiedzi — ciche odnowienie po prostu ma mniejsze szanse */
  }
}

/**
 * Planuje ciche odnowienie tokenu na kilka minut przed wygaśnięciem.
 * Gdy aplikacja jest w tle, odnowienie nastąpi po powrocie (visibilitychange).
 */
function scheduleRefresh(): void {
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = null
  if (!accessToken) return
  const delay = Math.max(0, tokenExpiry - REFRESH_AHEAD_MS - Date.now())
  refreshTimer = setTimeout(refreshIfDue, delay)
}

function refreshIfDue(): void {
  if (!accessToken || document.visibilityState !== 'visible') return
  if (useAuthStatus.getState().authNeeded) return
  if (tokenExpiry - Date.now() > REFRESH_AHEAD_MS) return
  // Porażka odnowienia z wyprzedzeniem nie zapala jeszcze paska — obecny
  // token jest wciąż ważny; flagę ustawi dopiero próba po jego wygaśnięciu.
  void silentRefresh().catch(() => {})
}

// Przywróć token przy załadowaniu modułu.
loadStoredToken()
loadStoredHint()
scheduleRefresh()
document.addEventListener('visibilitychange', refreshIfDue)

function loadGis(): Promise<void> {
  if (gisReady) return gisReady
  gisReady = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve()
    const s = document.createElement('script')
    s.src = GIS_SRC
    s.async = true
    s.defer = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Nie udało się załadować Google Identity Services'))
    document.head.appendChild(s)
  })
  return gisReady
}

export function isSignedIn(): boolean {
  return !!accessToken && Date.now() < tokenExpiry
}

/**
 * Zwraca ważny access token; w razie potrzeby uruchamia okno logowania Google.
 * Wymaga skonfigurowanego Client ID w ustawieniach.
 */
export async function getAccessToken(interactive = true): Promise<string> {
  if (isSignedIn()) {
    useAuthStatus.getState().setAuthNeeded(false)
    return accessToken!
  }

  // Interaktywne (z przycisku, po geście użytkownika) zawsze uruchamiamy od razu.
  if (interactive) return requestToken(true).catch(flagAuthNeeded)

  // Ciche odnowienie już się nie udało → nie próbujemy ponownie przy każdym
  // syncu (każda próba to mignięcie okna GIS). Czekamy na kliknięcie paska.
  if (useAuthStatus.getState().authNeeded) {
    throw new Error('Logowanie Google wymaga interakcji — kliknij „Zaloguj do Google".')
  }
  return silentRefresh().catch(flagAuthNeeded)
}

function flagAuthNeeded(e: unknown): never {
  // Nie udało się pobrać tokenu → pokaż wskaźnik „zaloguj" u góry.
  useAuthStatus.getState().setAuthNeeded(true)
  throw e
}

/**
 * Ciche żądania łączymy w jedno — kolejne wywołania dołączają do trwającego,
 * zamiast otwierać własne okno GIS.
 */
function silentRefresh(): Promise<string> {
  if (!silentRequest) {
    silentRequest = requestToken(false).finally(() => {
      silentRequest = null
    })
  }
  return silentRequest
}

async function requestToken(interactive: boolean): Promise<string> {
  const clientId = useSettings.getState().googleClientId.trim()
  if (!clientId) {
    throw new Error('Brak Google Client ID — uzupełnij w Ustawieniach.')
  }

  await loadGis()

  return new Promise<string>((resolve, reject) => {
    tokenClient = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: GOOGLE_SCOPES,
      ...(loginHint ? { login_hint: loginHint } : {}),
      callback: (resp) => {
        if (resp.error || !resp.access_token) {
          reject(new Error(resp.error || 'Autoryzacja nieudana'))
          return
        }
        accessToken = resp.access_token
        tokenExpiry = Date.now() + (resp.expires_in - 60) * 1000
        persistToken()
        scheduleRefresh()
        void rememberLoginHint(accessToken)
        useAuthStatus.getState().setAuthNeeded(false)
        resolve(accessToken)
      },
      // Bez tego callbacku ciche niepowodzenie (np. prompt:'none' bez sesji)
      // nigdy nie rozstrzygnęłoby Promise — token „wisiałby" w nieskończoność.
      error_callback: (err) => {
        reject(
          new Error(
            err?.message ||
              (err?.type === 'popup_closed'
                ? 'Zamknięto okno logowania Google.'
                : 'Logowanie Google wymaga interakcji — kliknij „Zaloguj do Google".'),
          ),
        )
      },
    })
    tokenClient.requestAccessToken({ prompt: interactive ? '' : 'none' })
  })
}

export function signOut(): void {
  accessToken = null
  tokenExpiry = 0
  loginHint = null
  scheduleRefresh()
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY)
    localStorage.removeItem(HINT_STORAGE_KEY)
  } catch {
    /* ignorujemy */
  }
}

/**
 * Wygodny wrapper na fetch do Google API z tokenem.
 * Używa trybu cichego (bez okna logowania) — jeśli sesja Google jest aktywna,
 * token odnawia się bez UI; w przeciwnym razie rzuca błąd, który obsługują
 * automatyczne synchronizacje (w tle). Interaktywne logowanie następuje
 * wyłącznie po jawnej akcji użytkownika (przyciski w Ustawieniach).
 */
export async function gapiFetch(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = await getAccessToken(false)
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  return fetch(url, { ...init, headers })
}
