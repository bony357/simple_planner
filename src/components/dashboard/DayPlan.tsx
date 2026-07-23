import { useState } from 'react'
import { endOfWeek, startOfWeek } from 'date-fns'
import { fmtDate, fmtDayLabel, toDateKey } from '../../lib/dates'
import ScheduleCalendar, { type CalendarView } from '../calendar/ScheduleCalendar'
import styles from './DayPlan.module.css'

interface DayPlanProps {
  /** Dzień „bazowy" (zwykle dziś) — punkt startowy i cel przycisku „Dziś". */
  date: string
}

/** Liczba dni, o którą przesuwają strzałki dla danego widoku. */
function viewStep(view: CalendarView): number {
  return view === 'timeGridWeek' ? 7 : view === 'timeGridThreeDay' ? 3 : 1
}

function shiftDay(dateKey: string, days: number): string {
  return toDateKey(
    new Date(new Date(`${dateKey}T00:00:00`).getTime() + days * 86400000),
  )
}

function rangeLabel(dateKey: string, view: CalendarView): string {
  const d = new Date(`${dateKey}T00:00:00`)
  if (view === 'timeGridWeek') {
    const s = startOfWeek(d, { weekStartsOn: 1 })
    const e = endOfWeek(d, { weekStartsOn: 1 })
    return `${fmtDate(toDateKey(s))} – ${fmtDate(toDateKey(e))}`
  }
  // 3 dni
  return `${fmtDate(dateKey)} – ${fmtDate(shiftDay(dateKey, 2))}`
}

export default function DayPlan({ date }: DayPlanProps) {
  const [view, setView] = useState<CalendarView>('timeGridDay')
  const [current, setCurrent] = useState(date)

  const step = viewStep(view)
  const goPrev = () => setCurrent((c) => shiftDay(c, -step))
  const goNext = () => setCurrent((c) => shiftDay(c, step))

  const label =
    view === 'timeGridDay' ? fmtDayLabel(current) : rangeLabel(current, view)

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
            className={view === 'timeGridThreeDay' ? styles.active : ''}
            onClick={() => setView('timeGridThreeDay')}
          >
            3 dni
          </button>
          <button
            className={view === 'timeGridWeek' ? styles.active : ''}
            onClick={() => setView('timeGridWeek')}
          >
            Tydzień
          </button>
        </div>
      </div>

      <div className={styles.nav}>
        <button
          className={styles.navBtn}
          aria-label="Poprzedni"
          onClick={goPrev}
        >
          ‹
        </button>
        <span className={styles.dayLabel}>{label}</span>
        <button className={styles.navBtn} aria-label="Następny" onClick={goNext}>
          ›
        </button>
        {current !== date && (
          <button className={styles.today} onClick={() => setCurrent(date)}>
            Dziś
          </button>
        )}
      </div>

      <div className={styles.calWrap}>
        <ScheduleCalendar date={current} view={view} />
      </div>
    </section>
  )
}
