import { useState } from 'react'
import { endOfWeek, format, startOfWeek } from 'date-fns'
import { pl } from 'date-fns/locale'
import { fmtDayLabel } from '../../lib/dates'
import ScheduleCalendar, { type CalendarView } from '../calendar/ScheduleCalendar'
import styles from './DayPlan.module.css'

interface DayPlanProps {
  date: string
}

function weekLabel(date: string): string {
  const d = new Date(`${date}T00:00:00`)
  const s = startOfWeek(d, { weekStartsOn: 1 })
  const e = endOfWeek(d, { weekStartsOn: 1 })
  return `${format(s, 'd MMM', { locale: pl })} – ${format(e, 'd MMM', { locale: pl })}`
}

export default function DayPlan({ date }: DayPlanProps) {
  const [view, setView] = useState<CalendarView>('timeGridDay')

  return (
    <section className={`card ${styles.panel}`}>
      <div className="card-title">
        Plan dnia
        <div className={styles.toggle}>
          <button
            className={view === 'timeGridDay' ? styles.active : ''}
            onClick={() => setView('timeGridDay')}
          >
            Dzień
          </button>
          <button
            className={view === 'timeGridWeek' ? styles.active : ''}
            onClick={() => setView('timeGridWeek')}
          >
            Tydzień
          </button>
        </div>
      </div>
      <div className={styles.dayLabel}>
        {view === 'timeGridDay' ? fmtDayLabel(date) : weekLabel(date)}
      </div>
      <div className={styles.calWrap}>
        <ScheduleCalendar date={date} view={view} />
      </div>
      <p className={styles.hint}>
        Dotknij pusty slot, aby dodać wydarzenie. Przeciągnij zadanie z listy na oś
        czasu; ciągnij krawędź, aby zmienić czas trwania.
      </p>
    </section>
  )
}
