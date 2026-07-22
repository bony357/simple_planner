import { useState } from 'react'
import { useSettings } from '../store/useSettings'
import { getAccessToken, isSignedIn, signOut } from '../services/google/auth'
import { runSync } from '../services/google/sync'
import { exportToSheets, importFromSheets } from '../services/google/sheets'
import { fmtTime } from '../lib/dates'

export default function Settings() {
  const s = useSettings()
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const withBusy = async (key: string, fn: () => Promise<void>, ok: string) => {
    setBusy(key)
    setMsg(null)
    try {
      await fn()
      setMsg(ok)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Błąd')
    } finally {
      setBusy(null)
    }
  }

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
            <label>ID kalendarza</label>
            <input
              className="input"
              placeholder="primary"
              value={s.calendarId}
              onChange={(e) => s.update({ calendarId: e.target.value })}
            />
          </div>
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
            <button
              className="btn"
              disabled={busy !== null}
              onClick={() =>
                withBusy('sync', () => runSync(true), 'Synchronizacja zakończona.')
              }
            >
              {busy === 'sync' ? 'Synchronizuję…' : 'Synchronizuj teraz'}
            </button>
            <button className="btn" onClick={() => { signOut(); setMsg('Wylogowano.') }}>
              Wyloguj
            </button>
          </div>
          {s.lastSyncAt && (
            <p className="muted">Ostatnia synchronizacja: {fmtTime(s.lastSyncAt)}</p>
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
            <select
              className="select"
              value={s.geminiModel}
              onChange={(e) => s.update({ geminiModel: e.target.value })}
            >
              <option value="gemini-2.5-flash">gemini-2.5-flash</option>
              <option value="gemini-2.5-pro">gemini-2.5-pro</option>
              <option value="gemini-2.0-flash">gemini-2.0-flash</option>
            </select>
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
