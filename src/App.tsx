import { HashRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom'
import Dashboard from './routes/Dashboard'
import Tasks from './routes/Tasks'
import Recurring from './routes/Recurring'
import Settings from './routes/Settings'

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
          <NavLink to="/" end>
            <span className="nav-icon">📅</span>
            <span>Dziś</span>
          </NavLink>
          <NavLink to="/tasks">
            <span className="nav-icon">✓</span>
            <span>Zadania</span>
          </NavLink>
          <NavLink to="/recurring">
            <span className="nav-icon">🔁</span>
            <span>Cykliczne</span>
          </NavLink>
          <NavLink to="/settings">
            <span className="nav-icon">⚙</span>
            <span>Ustawienia</span>
          </NavLink>
        </nav>
      </div>
    </HashRouter>
  )
}
