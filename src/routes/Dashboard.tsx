import { useEffect, useState } from 'react'
import DayPlan from '../components/dashboard/DayPlan'
import UpcomingSchedule from '../components/dashboard/UpcomingSchedule'
import TodoList from '../components/dashboard/TodoList'
import AssistantPanel from '../components/gemini/AssistantPanel'
import Sheet from '../components/common/Sheet'
import { todayISO } from '../lib/dates'
import { useSettings } from '../store/useSettings'
import { runSync } from '../services/google/sync'
import styles from './Dashboard.module.css'

export default function Dashboard() {
  const today = todayISO()
  const [showAssistant, setShowAssistant] = useState(false)
  const syncCalendar = useSettings((s) => s.syncCalendar)

  // Synchronizacja z Google Calendar przy wejściu (jeśli włączona).
  useEffect(() => {
    if (syncCalendar) void runSync().catch(() => {})
  }, [syncCalendar])

  return (
    <div className={styles.dash}>
      <div className={styles.header}>
        <h1>Dziś</h1>
        <button className="btn" onClick={() => setShowAssistant(true)}>
          ✨ Asystent
        </button>
      </div>

      <div className={styles.cols}>
        <div className={styles.left}>
          <div className={styles.dayPlanSlot}>
            <DayPlan date={today} />
          </div>
          <div className={styles.upcomingSlot}>
            <UpcomingSchedule fromDate={today} />
          </div>
        </div>
        <div className={styles.right}>
          <TodoList />
        </div>
      </div>

      <Sheet
        open={showAssistant}
        title="Asystent Gemini"
        onClose={() => setShowAssistant(false)}
      >
        <AssistantPanel onClose={() => setShowAssistant(false)} />
      </Sheet>
    </div>
  )
}
