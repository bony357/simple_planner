# Simple Planner

Osobisty planer dnia jako **PWA** (React + TypeScript + Vite), zoptymalizowany pod
**tablet w orientacji A4** i ekrany dotykowe. Działa **offline** (local-first,
IndexedDB), z opcjonalną synchronizacją z **Google Calendar / Google Sheets** oraz
asystentem **Gemini**. Hostowany na **GitHub Pages**.

## Funkcje

- **Dashboard „Dziś"**: plan dnia (oś czasu 15 min z pustymi slotami), agenda
  najbliższych dni, lista to-do grupowana wg kategorii.
- **Przeciąganie zadań** z listy to-do na oś czasu; przenoszenie i rozciąganie
  wydarzeń jak w Google Calendar (snap co 15 min).
- **To-do**: szybkie dodawanie, odznaczanie wykonanych, dobieranie niedokończonych
  zadań z poprzednich dni.
- **Zadania i kategorie**: pełna lista z filtrami, kolorowe kategorie.
- **Zadania cykliczne** (RRULE) — np. comiesięczne rachunki.
- **Motyw kolorowy** oraz **monochromatyczny e-ink** (wysoki kontrast, bez animacji).
- **Integracje** (opcjonalne): Google Calendar (dwukierunkowo), Google Sheets
  (kopia zadań), Gemini (sugestie zatwierdzane ręcznie).

## Uruchomienie lokalne

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # produkcyjny build do dist/
npm run preview    # podgląd builda
```

Aplikacja działa od razu bez żadnych kluczy (dane trzymane lokalnie w przeglądarce).

## Konfiguracja integracji (opcjonalna)

Wszystkie klucze wpisuje się w aplikacji w zakładce **Ustawienia**. W statycznej
PWA nie ma serwera — klucze są zapisywane lokalnie (`localStorage`) i widoczne w
przeglądarce. Używaj wyłącznie na własnym urządzeniu i ogranicz klucze
(referrer / restrykcje API).

### Google Calendar + Sheets

1. W [Google Cloud Console](https://console.cloud.google.com/) utwórz projekt.
2. Włącz **Google Calendar API** i **Google Sheets API**.
3. Skonfiguruj **OAuth consent screen** (typ External, dodaj siebie jako *test user*).
4. Utwórz **OAuth Client ID** typu *Web application* i dodaj **Authorized JavaScript origins**:
   - `http://localhost:5173` (dev)
   - `https://<twoja-nazwa>.github.io` (produkcja)
5. Skopiuj Client ID do **Ustawienia → Konto Google → Google OAuth Client ID**.
6. Włącz *Synchronizuj z Google Calendar* i/lub użyj *Eksportuj do Sheets*.

Zakresy OAuth: `calendar.events`, `spreadsheets`.

### Gemini

1. Wygeneruj klucz w [Google AI Studio](https://aistudio.google.com/apikey).
2. Wklej go w **Ustawienia → Asystent Gemini → Gemini API key**.
3. Wybierz model (domyślnie `gemini-2.5-flash`).

## Deploy na GitHub Pages

1. Utwórz repozytorium o nazwie **`simple_planner`** (musi zgadzać się z `base`
   w [vite.config.ts](vite.config.ts) — jeśli inna nazwa, zmień `BASE`).
2. Wypchnij kod na gałąź `main`.
3. W **Settings → Pages** ustaw *Source: GitHub Actions*.
4. Workflow [.github/workflows/deploy.yml](.github/workflows/deploy.yml) zbuduje
   i opublikuje aplikację pod `https://<user>.github.io/simple_planner/`.
5. Na tablecie otwórz adres i **zainstaluj jako aplikację** (Dodaj do ekranu głównego).

## Architektura

- **Dane:** IndexedDB przez Dexie ([src/db](src/db)) — źródło prawdy, offline-first.
- **Ustawienia:** Zustand + `persist` ([src/store/useSettings.ts](src/store/useSettings.ts)).
- **Kalendarz:** FullCalendar (timeGrid + interaction) w
  [src/components/calendar/ScheduleCalendar.tsx](src/components/calendar/ScheduleCalendar.tsx).
- **Integracje:** [src/services/google](src/services/google) (auth/calendar/sheets/sync),
  [src/services/gemini.ts](src/services/gemini.ts), [src/services/recurrence.ts](src/services/recurrence.ts).
- **Motywy:** zmienne CSS w [src/theme/tokens.css](src/theme/tokens.css).
