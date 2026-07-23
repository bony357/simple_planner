import { useState } from 'react'
import { useSettings } from '../store/useSettings'
import { getAccessToken, isSignedIn, signOut } from '../services/google/auth'
import { runSync } from '../services/google/sync'
import { listCalendars } from '../services/google/calendar'
import { exportToSheets, importFromSheets } from '../services/google/sheets'
import { listGeminiModels } from '../services/gemini'
import type { CalendarInfo } from '../db/types'
import { fmtTime } from '../lib/dates'

export default function Settings() {
  const s = useSettings()
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [models, setModels] = useState<string[]>([])

  const withBusy = async (key: string, fn: () => Promise<void>, ok?: string) => {
    setBusy(key)
    setMsg(null)
    try {
      await fn()
      if (ok) setMsg(ok)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Błąd')
    } finally {
      setBusy(null)
    }
  }

  const doSync = () =>
    withBusy('sync', async () => {
      const r = await runSync(true)
      setMsg(
        r
          ? `Synchronizacja OK — wysłano ${r.pushed}, pobrano ${r.pulled}.`
          : 'Synchronizacja pominięta (włącz przełącznik powyżej lub brak Client ID).',
      )
    })

  const loadModels = () =>
    withBusy(
      'models',
      async () => {
        const list = await listGeminiModels()
        setModels(list)
        setMsg(`Znaleziono ${list.length} modeli. Wybierz z listy.`)
      },
      'Pobrano modele.',
    )

  return (
    <div className="page">
      <div className="page-header">
        <h1>Ustawienia</h1>
      </div>

      {/* Motyw */}
      <section className="card">
        <div className="card-title">Motyw</div>
        <div className="row" style={{ padding: 'var(--gap) var(--gap-lg) var(--gap-lg)' }}>
          <button
            className={`btn ${s.theme === 'color' ? 'btn-primary' : ''}`}
            style={{ flex: 1 }}
            onClick={() => s.setTheme('color')}
          >
            🎨 Kolorowy
          </button>
          <button
            className={`btn ${s.theme === 'eink' ? 'btn-primary' : ''}`}
            style={{ flex: 1 }}
            onClick={() => s.setTheme('eink')}
          >
            🖋 E-ink (mono)
          </button>
        </div>
      </section>

      {/* Google */}
      <section className="card">
        <div className="card-title">Konto Google</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap)', padding: 'var(--gap) var(--gap-lg) var(--gap-lg)' }}>
          <div className="field">
            <label>Google OAuth Client ID</label>
            <input
              className="input"
              placeholder="xxxxx.apps.googleusercontent.com"
              value={s.googleClientId}
              onChange={(e) => s.update({ googleClientId: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Kalendarz zapisu (jedyny zapisywalny)</label>
            {s.availableCalendars.length > 0 ? (
              <select
                className="select"
                value={s.calendarId}
                onChange={(e) => s.update({ calendarId: e.target.value })}
              >
                {mergeCalendarOptions(s.availableCalendars, s.calendarId).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.summary}
                    {c.accessRole && c.accessRole !== 'owner' && c.accessRole !== 'writer'
                      ? ' (brak prawa zapisu!)'
                      : ''}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="input"
                placeholder="primary"
                value={s.calendarId}
                onChange={(e) => s.update({ calendarId: e.target.value })}
              />
            )}
          </div>

          <button
            className="btn"
            disabled={busy !== null}
            onClick={() =>
              withBusy(
                'cals',
                async () => {
                  const cals = await listCalendars()
                  s.update({ availableCalendars: cals })
                },
                'Pobrano listę kalendarzy.',
              )
            }
          >
            {busy === 'cals' ? 'Pobieram…' : 'Pobierz kalendarze konta'}
          </button>

          {s.availableCalendars.length > 0 && (
            <div className="field">
              <label>Kalendarze do podglądu (tylko odczyt)</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {s.availableCalendars
                  .filter((c) => c.id !== s.calendarId)
                  .map((c) => {
                    const checked = s.readCalendarIds.includes(c.id)
                    return (
                      <label key={c.id} className="row" style={{ gap: 10 }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          style={{ width: 22, height: 22 }}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...s.readCalendarIds, c.id]
                              : s.readCalendarIds.filter((id) => id !== c.id)
                            s.update({ readCalendarIds: next })
                          }}
                        />
                        {c.backgroundColor && (
                          <span
                            style={{
                              width: 14,
                              height: 14,
                              borderRadius: 4,
                              background: c.backgroundColor,
                              border: '1px solid var(--border-strong)',
                            }}
                          />
                        )}
                        {c.summary}
                      </label>
                    )
                  })}
              </div>
            </div>
          )}

          <label className="row" style={{ gap: 10 }}>
            <input
              type="checkbox"
              checked={s.syncCalendar}
              onChange={(e) => s.update({ syncCalendar: e.target.checked })}
              style={{ width: 24, height: 24 }}
            />
            Synchronizuj z Google Calendar
          </label>
          <div className="row row-wrap">
            <button
              className="btn"
              disabled={busy !== null}
              onClick={() =>
                withBusy('login', async () => {
                  await getAccessToken(true)
                }, 'Zalogowano do Google.')
              }
            >
              {isSignedIn() ? 'Zalogowano ✓' : 'Zaloguj do Google'}
            </button>
            <button className="btn" disabled={busy !== null} onClick={doSync}>
              {busy === 'sync' ? 'Synchronizuję…' : 'Synchronizuj teraz'}
            </button>
            <button className="btn" onClick={() => { signOut(); setMsg('Wylogowano.') }}>
              Wyloguj
            </button>
          </div>
          <p className="muted" style={{ fontSize: 'var(--font-size-sm)' }}>
            Do Google Calendar trafiają tylko <b>wydarzenia</b> (zadania
            przeciągnięte na oś czasu lub utworzone w kalendarzu) — same wpisy z
            listy to-do nie. Wymagane: zalogowanie i włączony przełącznik powyżej.
          </p>
          {s.lastSyncAt && (
            <p className="muted">Ostatnia synchronizacja: {fmtTime(s.lastSyncAt)}</p>
          )}
          {s.lastSyncError && (
            <p style={{ color: 'var(--danger)' }}>Błąd sync: {s.lastSyncError}</p>
          )}
        </div>
      </section>

      {/* Sheets */}
      <section className="card">
        <div className="card-title">Kopia w Google Sheets</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap)', padding: 'var(--gap) var(--gap-lg) var(--gap-lg)' }}>
          <div className="field">
            <label>ID arkusza (tworzony automatycznie przy eksporcie)</label>
            <input
              className="input"
              placeholder="(puste = utwórz nowy)"
              value={s.sheetsId}
              onChange={(e) => s.update({ sheetsId: e.target.value })}
            />
          </div>
          <div className="row row-wrap">
            <button
              className="btn"
              disabled={busy !== null}
              onClick={() =>
                withBusy('export', exportToSheets, 'Zadania wyeksportowane do arkusza.')
              }
            >
              {busy === 'export' ? 'Eksportuję…' : 'Eksportuj do Sheets'}
            </button>
            <button
              className="btn"
              disabled={busy !== null}
              onClick={() =>
                withBusy('import', importFromSheets, 'Zaimportowano z arkusza.')
              }
            >
              {busy === 'import' ? 'Importuję…' : 'Importuj z Sheets'}
            </button>
          </div>
        </div>
      </section>

      {/* Gemini */}
      <section className="card">
        <div className="card-title">Asystent Gemini</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap)', padding: 'var(--gap) var(--gap-lg) var(--gap-lg)' }}>
          <div className="field">
            <label>Gemini API key</label>
            <input
              className="input"
              type="password"
              placeholder="AIza…"
              value={s.geminiApiKey}
              onChange={(e) => s.update({ geminiApiKey: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Model</label>
            <div className="row">
              <select
                className="select"
                value={s.geminiModel}
                onChange={(e) => s.update({ geminiModel: e.target.value })}
              >
                {/* Modele pobrane z API (jeśli są) + bieżący + bezpieczne aliasy */}
                {mergeModelOptions(models, s.geminiModel).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <button
                className="btn"
                disabled={busy !== null}
                onClick={loadModels}
                title="Pobierz listę modeli dostępnych dla Twojego klucza"
              >
                {busy === 'models' ? '…' : 'Pobierz modele'}
              </button>
            </div>
            <span className="muted" style={{ fontSize: 'var(--font-size-sm)' }}>
              Aliasy „-latest" są najbezpieczniejsze — zawsze wskazują aktualny model.
            </span>
          </div>
        </div>
      </section>

      <p className="muted" style={{ fontSize: 'var(--font-size-sm)' }}>
        Uwaga: klucze zapisywane są lokalnie na tym urządzeniu (localStorage). W
        statycznej aplikacji PWA są widoczne w przeglądarce — zalecane ograniczenie
        klucza (referrer/API). Nie używaj tej instancji na współdzielonym urządzeniu.
      </p>

      {msg && (
        <p
          style={{
            padding: 'var(--gap)',
            background: 'var(--surface-2)',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          {msg}
        </p>
      )}
    </div>
  )
}

/** Opcje kalendarza zapisu: pobrane + bieżący (gdyby nie było go na liście). */
function mergeCalendarOptions(
  cals: CalendarInfo[],
  current: string,
): CalendarInfo[] {
  if (cals.some((c) => c.id === current)) return cals
  return [{ id: current, summary: current }, ...cals]
}

/** Lista opcji modelu: pobrane z API (jeśli są) + bezpieczne aliasy + bieżący wybór. */
function mergeModelOptions(fetched: string[], current: string): string[] {
  const fallback = [
    'gemini-flash-latest',
    'gemini-pro-latest',
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'gemini-2.0-flash',
  ]
  const base = fetched.length ? fetched : fallback
  return Array.from(new Set([current, ...base].filter(Boolean)))
}
