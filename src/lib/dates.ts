import { format, parseISO } from 'date-fns'
import { pl } from 'date-fns/locale'

/** Data dzisiejsza w formacie YYYY-MM-DD (lokalna strefa). */
export function todayISO(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

export function toDateKey(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

export function fmtTime(iso: string): string {
  return format(parseISO(iso), 'HH:mm')
}

/** Data w formacie DD/MM/YYYY. Przyjmuje „YYYY-MM-DD" lub pełne ISO. */
export function fmtDate(dateKeyOrIso: string): string {
  return format(parseISO(dateKeyOrIso), 'dd/MM/yyyy')
}

export function fmtDayLabel(dateKey: string): string {
  return format(parseISO(dateKey), 'EEEE, dd/MM/yyyy', { locale: pl })
}

export function fmtShortDay(iso: string): string {
  return format(parseISO(iso), 'EEE, dd/MM/yyyy', { locale: pl })
}

/** Zaokrąglij do najbliższego wielokrotności minut (domyślnie 15). */
export function roundToMinutes(date: Date, step = 15): Date {
  const ms = step * 60 * 1000
  return new Date(Math.round(date.getTime() / ms) * ms)
}

export function addMinutes(iso: string, minutes: number): string {
  return new Date(parseISO(iso).getTime() + minutes * 60 * 1000).toISOString()
}
