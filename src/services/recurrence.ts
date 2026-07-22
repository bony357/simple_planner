import { RRule, rrulestr } from 'rrule'
import type { Task } from '../db/types'

export interface RecurrencePreset {
  label: string
  rule: string
}

/** Gotowe presety powtarzalności prezentowane w formularzu. */
export const RECURRENCE_PRESETS: RecurrencePreset[] = [
  { label: 'Nie powtarza się', rule: '' },
  { label: 'Codziennie', rule: 'FREQ=DAILY' },
  { label: 'Co tydzień', rule: 'FREQ=WEEKLY' },
  { label: 'Co 2 tygodnie', rule: 'FREQ=WEEKLY;INTERVAL=2' },
  { label: 'Co miesiąc (1. dnia)', rule: 'FREQ=MONTHLY;BYMONTHDAY=1' },
  { label: 'Co miesiąc (ostatni dzień)', rule: 'FREQ=MONTHLY;BYMONTHDAY=-1' },
  { label: 'Co rok', rule: 'FREQ=YEARLY' },
]

export function recurrenceLabel(rule?: string): string | undefined {
  if (!rule) return undefined
  const preset = RECURRENCE_PRESETS.find((p) => p.rule === rule)
  if (preset) return preset.label
  try {
    return rrulestr(rule).toText()
  } catch {
    return 'cyklicznie'
  }
}

/**
 * Następne wystąpienie reguły po dacie `after` (włącznie).
 * Zwraca YYYY-MM-DD albo undefined.
 */
export function nextOccurrence(rule: string, after: Date): string | undefined {
  try {
    const options = RRule.parseString(rule)
    options.dtstart = after
    const r = new RRule(options)
    const next = r.after(after, true)
    if (!next) return undefined
    return next.toISOString().slice(0, 10)
  } catch {
    return undefined
  }
}

/**
 * Zadania cykliczne, których termin wypada w ciągu najbliższych `days` dni —
 * używane przez Gemini/przypominajkę o rachunkach.
 */
export function upcomingRecurring(
  tasks: Task[],
  from: Date,
  days = 14,
): { task: Task; nextDate: string }[] {
  const horizon = new Date(from.getTime() + days * 86400000)
  const out: { task: Task; nextDate: string }[] = []
  for (const t of tasks) {
    if (!t.recurrenceRule) continue
    const next = nextOccurrence(t.recurrenceRule, from)
    if (next && new Date(next) <= horizon) out.push({ task: t, nextDate: next })
  }
  return out.sort((a, b) => a.nextDate.localeCompare(b.nextDate))
}
