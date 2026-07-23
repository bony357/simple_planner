import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { ensureSeeded } from './db/dexie'
import { applyStoredTheme } from './store/useSettings'
import { materializeCalendarTasks } from './services/tasksFromCalendar'
import './theme/global.css'

applyStoredTheme()
void ensureSeeded().then(() => materializeCalendarTasks().catch(() => {}))

registerSW({ immediate: true })

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
