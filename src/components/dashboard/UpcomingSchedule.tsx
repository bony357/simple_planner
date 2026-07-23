import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/dexie'
import type { CalendarEvent } from '../../db/types'
import { fmtShortDay, fmtTime } from '../../lib/dates'
import styles from './UpcomingSchedule.module.css'

interface UpcomingScheduleProps {
  /** Pierwszy dzień (YYYY-MM-DD); pokazujemy kolejne `days` dni po nim. */
  fromDate: string
  days?: number
}

/** Agenda najbliższych dni — same wpisane wydarzenia, bez pustych slotów. */
export default function UpcomingSchedule({ fromDate, days = 7 }: UpcomingScheduleProps) {
  // Sekcja pokazuje tylko kolejne dni — dzisiejszy dzień jest wykluczony.
  const tomorrowKey = new Date(new Date(fromDate).getTime() + 86400000)
    .toISOString()
    .slice(0, 10)
  const lower = `${tomorrowKey}T00:00:00`
  const endKey = new Date(new Date(fromDate).getTime() + days * 86400000)
    .toISOString()
    .slice(0, 10)
  const end = `${endKey}T23:59:59`

  const events = useLiveQuery(async () => {
    const all = await db.events.toArray()
    return all
      .filter((e) => e.syncState !== 'deleted' && e.start >= lower && e.start <= end)
      .sort((a, b) => a.start.localeCompare(b.start))
  }, [lower, end]) ?? []

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const e of events) {
      const key = e.start.slice(0, 10)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(e)
    }
    return [...map.entries()]
  }, [events])

  return (
    <section className={`card ${styles.panel}`}>
      <div className="card-title">Najbliższe dni</div>
      {byDay.length === 0 ? (
        <p className="empty">Brak zaplanowanych wydarzeń w najbliższych dniach.</p>
      ) : (
        <div className={styles.agenda}>
          {byDay.map(([day, evs]) => (
            <div key={day} className={styles.dayBlock}>
              <div className={styles.dayHead}>{fmtShortDay(evs[0].start)}</div>
              <div className={styles.events}>
                {evs.map((e) => (
                  <div key={e.id} className={styles.event}>
                    <span
                      className={styles.bar}
                      style={{ background: e.color || 'var(--accent)' }}
                    />
                    <span className={styles.time}>
                      {fmtTime(e.start)}–{fmtTime(e.end)}
                    </span>
                    <span className={styles.title}>{e.title}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
