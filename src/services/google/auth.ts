import { useSettings } from '../../store/useSettings'

// Minimalne typy dla Google Identity Services (ładowane ze skryptu).
interface TokenResponse {
  access_token: string
  expires_in: number
  error?: string
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
            callback: (resp: TokenResponse) => void
          }) => TokenClient
        }
      }
    }
  }
}

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/spreadsheets',
].join(' ')

const GIS_SRC = 'https://accounts.google.com/gsi/client'

let gisReady: Promise<void> | null = null
let tokenClient: TokenClient | null = null
let accessToken: string | null = null
let tokenExpiry = 0

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
  if (isSignedIn()) return accessToken!

  const clientId = useSettings.getState().googleClientId.trim()
  if (!clientId) {
    throw new Error('Brak Google Client ID — uzupełnij w Ustawieniach.')
  }

  await loadGis()

  return new Promise<string>((resolve, reject) => {
    tokenClient = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: GOOGLE_SCOPES,
      callback: (resp) => {
        if (resp.error || !resp.access_token) {
          reject(new Error(resp.error || 'Autoryzacja nieudana'))
          return
        }
        accessToken = resp.access_token
        tokenExpiry = Date.now() + (resp.expires_in - 60) * 1000
        resolve(accessToken)
      },
    })
    tokenClient.requestAccessToken({ prompt: interactive ? '' : 'none' })
  })
}

export function signOut(): void {
  accessToken = null
  tokenExpiry = 0
}

/** Wygodny wrapper na fetch do Google API z tokenem. */
export async function gapiFetch(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = await getAccessToken()
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  return fetch(url, { ...init, headers })
}
