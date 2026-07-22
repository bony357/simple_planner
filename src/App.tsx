import type { MouseEvent } from 'react'
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import Dashboard from './routes/Dashboard'
import Tasks from './routes/Tasks'
import Recurring from './routes/Recurring'
import Settings from './routes/Settings'

/**
 * Zakładka nawigacji dolnej. Zmiana zakładki nigdy nie dokłada więcej niż
 * jeden wpis historii nad ekranem głównym — dzięki temu gest "wstecz" z
 * dowolnej zakładki wraca na ekran główny, a nie po kolei przez wszystkie
 * wcześniej odwiedzone zakładki.
 */
function TabLink({ to, end, icon, label }: { to: string; end?: boolean; icon: string; label: string }) {
  const navigate = useNavigate()
  const location = useLocation()
  const isActive = end ? location.pathname === to : location.pathname.startsWith(to)

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    if (isActive) return
    navigate(to, { replace: location.pathname !== '/' })
  }

  return (
    <a href={`#${to}`} className={isActive ? 'active' : undefined} onClick={handleClick}>
      <span className="nav-icon">{icon}</span>
      <span>{label}</span>
    </a>
  )
}

export default function App() {
  return (
    <HashRouter>
      <div className="app-shell">
        <main className="app-main">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/recurring" element={<Recurring />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <nav className="app-nav">
          <TabLink to="/" end icon="📅" label="Dziś" />
          <TabLink to="/tasks" icon="✓" label="Zadania" />
          <TabLink to="/recurring" icon="🔁" label="Cykliczne" />
          <TabLink to="/settings" icon="⚙" label="Ustawienia" />
        </nav>
      </div>
    </HashRouter>
  )
}
