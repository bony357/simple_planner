import { useEffect, useMemo, useRef, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin, { Draggable } from '@fullcalendar/interaction'
import type {
  DateSelectArg,
  EventClickArg,
  EventDropArg,
  EventInput,
} from '@fullcalendar/core'
import type { DateClickArg, EventResizeDoneArg } from '@fullcalendar/interaction'
import { startOfWeek, endOfWeek } from 'date-fns'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/dexie'
import { addEvent, deleteEvent, updateEvent } from '../../db/repo'
import type { CalendarEvent } from '../../db/types'
import { addMinutes, toDateKey } from '../../lib/dates'
import { useSettings } from '../../store/useSettings'
import Sheet from '../common/Sheet'

function calendarName(id?: string): string {
  if (!id) return 'inny kalendarz'
  const found = useSettings
    .getState()
    .availableCalendars.find((c) => c.id === id)
  return found?.summary ?? id
}

export type CalendarView = 'timeGridDay' | 'timeGridWeek'

interface ScheduleCalendarProps {
  /** Data (YYYY-MM-DD) pokazywanego dnia/tygodnia. */
  date: string
  view?: CalendarView
}

/** Interaktywny plan: sloty 15 min, drag/drop z to-do, rozciąganie, tworzenie przez dotyk. */
export default function ScheduleCalendar({
  date,
  view = 'timeGridDay',
}: ScheduleCalendarProps) {
  // Zakres dat do zapytania o wydarzenia (dzień albo cały tydzień).
  const [rangeStart, rangeEnd] = useMemo(() => {
    const d = new Date(`${date}T00:00:00`)
    if (view === 'timeGridWeek') {
      return [
        toDateKey(startOfWeek(d, { weekStartsOn: 1 })),
        toDateKey(endOfWeek(d, { weekStartsOn: 1 })),
      ]
    }
    return [date, date]
  }, [date, view])

  const events =
    useLiveQuery(async () => {
      const from = `${rangeStart}T00:00:00`
      const to = `${rangeEnd}T23:59:59`
      const all = await db.events.toArray()
      return all.filter(
        (e) => e.syncState !== 'deleted' && e.start <= to && e.end >= from,
      )
    }, [rangeStart, rangeEnd]) ?? []

  const [selected, setSelected] = useState<CalendarEvent | null>(null)
  const [creating, setCreating] = useState<{ start: string; end: string } | null>(
    null,
  )

  // Umożliw przeciąganie elementów listy to-do na kalendarz.
  // Draggable deleguje po selektorze, więc łapie też elementy dodane później.
  const dragRef = useRef<Draggable | null>(null)
  useEffect(() => {
    dragRef.current = new Draggable(document.body, {
      itemSelector: '.fc-draggable-task[data-draggable="true"]',
      eventData: (el) => {
        return {
          title: el.getAttribute('data-task-title') ?? 'Zadanie',
          duration: toDuration(30),
          extendedProps: {
            taskId: el.getAttribute('data-task-id') ?? undefined,
            color: el.getAttribute('data-task-color') ?? undefined,
          },
        }
      },
    })
    return () => dragRef.current?.destroy()
  }, [])

  const fcEvents = useMemo<EventInput[]>(
    () =>
      events.map((e) => ({
        id: e.id,
        title: e.title,
        start: e.start,
        end: e.end,
        backgroundColor: e.color || undefined,
        borderColor: e.color || undefined,
        // Kalendarze podglądu są nieedytowalne (bez drag/resize).
        editable: !e.readOnly,
        classNames: [
          ...(e.taskId ? ['fc-event-task'] : []),
          ...(e.readOnly ? ['fc-event-readonly'] : []),
        ],
        extendedProps: { taskId: e.taskId },
      })),
    [events],
  )

  // Upuszczenie zadania z listy → utwórz wydarzenie w Dexie, usuń tymczasowe FC.
  const onReceive = async (info: {
    event: {
      startStr: string
      endStr: string
      title: string
      extendedProps: { taskId?: string; color?: string }
    }
    revert: () => void
  }) => {
    const start = info.event.startStr
    const end = info.event.endStr || addMinutes(start, 30)
    await addEvent({
      title: info.event.title,
      start,
      end,
      taskId: info.event.extendedProps.taskId,
      color: info.event.extendedProps.color || undefined,
      source: 'local',
    })
    info.revert() // realne wydarzenie dołoży live query
  }

  const persistTimes = async (arg: EventDropArg | EventResizeDoneArg) => {
    const { event } = arg
    if (!event.start || !event.end) return
    await updateEvent(event.id, {
      start: event.start.toISOString(),
      end: event.end.toISOString(),
    })
  }

  const onEventClick = (arg: EventClickArg) => {
    const ev = events.find((e) => e.id === arg.event.id)
    if (ev) setSelected(ev)
  }

  // Zaznaczenie zakresu (przeciągnięcie po pustych slotach) → nowe wydarzenie.
  const onSelect = (arg: DateSelectArg) => {
    setCreating({ start: arg.start.toISOString(), end: arg.end.toISOString() })
  }
  // Pojedyncze kliknięcie/tapnięcie w pusty slot → domyślnie 30 min.
  const onDateClick = (arg: DateClickArg) => {
    const start = arg.date.toISOString()
    setCreating({ start, end: addMinutes(start, 30) })
  }

  return (
    <>
      <FullCalendar
        key={view}
        plugins={[timeGridPlugin, interactionPlugin]}
        initialView={view}
        initialDate={date}
        firstDay={1}
        headerToolbar={false}
        dayHeaders={view === 'timeGridWeek'}
        dayHeaderFormat={{ weekday: 'short', day: 'numeric' }}
        allDaySlot={false}
        /* height 100% → FullCalendar sam zarządza przewijaniem, więc scrollTime
           faktycznie przewija oś do aktualnej godziny (przy height:auto był ignorowany). */
        height="100%"
        expandRows
        nowIndicator
        editable
        droppable
        selectable
        selectMirror
        eventResizableFromStart
        slotDuration="00:15:00"
        snapDuration="00:15:00"
        slotLabelInterval="01:00:00"
        scrollTime={currentScrollTime()}
        slotMinTime="05:00:00"
        slotMaxTime="24:00:00"
        longPressDelay={200}
        eventLongPressDelay={200}
        selectLongPressDelay={200}
        locale="pl"
        events={fcEvents}
        eventReceive={onReceive}
        eventDrop={persistTimes}
        eventResize={persistTimes}
        eventClick={onEventClick}
        select={onSelect}
        dateClick={onDateClick}
      />

      {/* Szczegóły istniejącego wydarzenia */}
      <Sheet
        open={!!selected}
        title={selected?.title}
        onClose={() => setSelected(null)}
      >
        {selected && (
          <>
            <p className="muted">{timeRange(selected.start, selected.end)}</p>
            {selected.readOnly ? (
              <p className="muted">
                Podgląd z kalendarza:{' '}
                <b>{calendarName(selected.calendarId)}</b>. Ten kalendarz jest tylko
                do odczytu — edytuj go w Google Calendar.
              </p>
            ) : (
              <button
                className="btn btn-danger btn-block"
                onClick={async () => {
                  await deleteEvent(selected.id)
                  setSelected(null)
                }}
              >
                Usuń z planu
              </button>
            )}
          </>
        )}
      </Sheet>

      {/* Tworzenie nowego wydarzenia w wybranym slocie */}
      <Sheet
        open={!!creating}
        title="Nowe wydarzenie"
        onClose={() => setCreating(null)}
      >
        {creating && (
          <NewEventForm
            start={creating.start}
            end={creating.end}
            onDone={() => setCreating(null)}
          />
        )}
      </Sheet>
    </>
  )
}

/** Mały formularz tworzenia wydarzenia z wybranego slotu kalendarza. */
function NewEventForm({
  start,
  end,
  onDone,
}: {
  start: string
  end: string
  onDone: () => void
}) {
  const [title, setTitle] = useState('')
  const save = async () => {
    await addEvent({ title: title.trim() || 'Wydarzenie', start, end, source: 'local' })
    onDone()
  }
  return (
    <>
      <p className="muted">{timeRange(start, end)}</p>
      <div className="field">
        <label>Nazwa</label>
        <input
          className="input"
          autoFocus
          placeholder="np. Spotkanie, trening…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
        />
      </div>
      <button className="btn btn-primary btn-block" onClick={save}>
        Dodaj do planu
      </button>
    </>
  )
}

function timeRange(startIso: string, endIso: string): string {
  const opt = { hour: '2-digit', minute: '2-digit' } as const
  const s = new Date(startIso)
  const e = new Date(endIso)
  const sameDay = s.toDateString() === e.toDateString()
  const day = s.toLocaleDateString('pl', { weekday: 'long', day: 'numeric', month: 'long' })
  return sameDay
    ? `${day}, ${s.toLocaleTimeString('pl', opt)}–${e.toLocaleTimeString('pl', opt)}`
    : `${s.toLocaleString('pl')} – ${e.toLocaleString('pl')}`
}

function toDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function currentScrollTime(): string {
  const h = Math.max(0, new Date().getHours() - 1)
  return `${String(h).padStart(2, '0')}:00:00`
}
