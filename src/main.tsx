import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { ensureSeeded } from './db/dexie'
import { applyStoredTheme } from './store/useSettings'
import { materializeCalendarTasks } from './services/tasksFromCalendar'
import { runTasksSync } from './services/google/tasksSync'
import './theme/global.css'

applyStoredTheme()
// Najpierw pobieramy zadania z Google (pull), dopiero potem materializujemy
// wydarzenia kalendarza. Dzięki temu drugie urządzenie zna już `sourceEventId`
// zadań utworzonych z kalendarza gdzie indziej i nie tworzy duplikatów.
void ensureSeeded()
  .then(() => runTasksSync(false).catch(() => {}))
  .then(() => materializeCalendarTasks().catch(() => {}))

registerSW({ immediate: true })

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
