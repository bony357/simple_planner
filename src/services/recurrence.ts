import { RRule } from 'rrule'
import type { RecurringTemplate } from '../db/types'

export interface RecurrencePreset {
  label: string
  rule: string
}

/** Gotowe presety powtarzalności (wykorzystywane pomocniczo). */
export const RECURRENCE_PRESETS: RecurrencePreset[] = [
  { label: 'Nie powtarza się', rule: '' },
  { label: 'Codziennie', rule: 'FREQ=DAILY' },
  { label: 'Co tydzień', rule: 'FREQ=WEEKLY' },
  { label: 'Co miesiąc (1. dnia)', rule: 'FREQ=MONTHLY;BYMONTHDAY=1' },
]

/* --------------------- Strukturalny builder reguł --------------------- */

export type RecurrenceKind = 'daily' | 'weekdays' | 'weekly' | 'monthly'

export const WEEKDAYS: { code: string; label: string }[] = [
  { code: 'MO', label: 'Pon' },
  { code: 'TU', label: 'Wt' },
  { code: 'WE', label: 'Śr' },
  { code: 'TH', label: 'Czw' },
  { code: 'FR', label: 'Pt' },
  { code: 'SA', label: 'Sob' },
  { code: 'SU', label: 'Nd' },
]
const WORKDAYS = ['MO', 'TU', 'WE', 'TH', 'FR']

export interface RecurrenceSpec {
  kind: RecurrenceKind
  weekdays: string[] // dla 'weekly'
  monthDay: number // dla 'monthly' (1..31 lub -1 = ostatni)
}

export const DEFAULT_SPEC: RecurrenceSpec = {
  kind: 'weekdays',
  weekdays: ['MO'],
  monthDay: 1,
}

/** Zbuduj łańcuch RRULE z wyborów formularza. */
export function buildRule(spec: RecurrenceSpec): string {
  switch (spec.kind) {
    case 'daily':
      return 'FREQ=DAILY'
    case 'weekdays':
      return `FREQ=WEEKLY;BYDAY=${WORKDAYS.join(',')}`
    case 'weekly': {
      const days = spec.weekdays.length ? spec.weekdays : ['MO']
      return `FREQ=WEEKLY;BYDAY=${days.join(',')}`
    }
    case 'monthly':
      return `FREQ=MONTHLY;BYMONTHDAY=${spec.monthDay}`
  }
}

/** Odczytaj wybory z istniejącej reguły (do edycji). */
export function parseRule(rule: string): RecurrenceSpec {
  const spec = { ...DEFAULT_SPEC, weekdays: ['MO'] }
  const get = (key: string) =>
    rule.split(';').find((p) => p.startsWith(key + '='))?.split('=')[1]
  const freq = get('FREQ')
  if (freq === 'DAILY') spec.kind = 'daily'
  else if (freq === 'MONTHLY') {
    spec.kind = 'monthly'
    spec.monthDay = Number(get('BYMONTHDAY')) || 1
  } else if (freq === 'WEEKLY') {
    const days = (get('BYDAY') || 'MO').split(',')
    const isWorkdays =
      days.length === 5 && WORKDAYS.every((d) => days.includes(d))
    spec.kind = isWorkdays ? 'weekdays' : 'weekly'
    spec.weekdays = days
  }
  return spec
}

/** Czytelny (polski) opis reguły. */
export function describeRule(rule?: string): string {
  if (!rule) return '—'
  const spec = parseRule(rule)
  switch (spec.kind) {
    case 'daily':
      return 'Codziennie'
    case 'weekdays':
      return 'W dni robocze (pon–pt)'
    case 'weekly':
      return (
        'Co tydzień: ' +
        spec.weekdays
          .map((c) => WEEKDAYS.find((w) => w.code === c)?.label ?? c)
          .join(', ')
      )
    case 'monthly':
      return spec.monthDay === -1
        ? 'Co miesiąc: ostatni dzień'
        : `Co miesiąc: dzień ${spec.monthDay}`
  }
}

export function recurrenceLabel(rule?: string): string | undefined {
  if (!rule) return undefined
  try {
    return describeRule(rule)
  } catch {
    return 'cyklicznie'
  }
}

/* ------------------------- Obliczanie wystąpień ------------------------
   Zadania cykliczne mają semantykę „całodniową" (dzień, bez godziny). Aby
   uniknąć pułapki stref czasowych w RRULE (lokalna północ = poprzedni dzień w
   UTC), całą arytmetykę prowadzimy na kluczach YYYY-MM-DD i datach o północy UTC. */

/** 'YYYY-MM-DD' → Date o północy UTC. */
function utcFromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}
/** Date → 'YYYY-MM-DD' (składowe UTC). */
function keyFromUtc(d: Date): string {
  return d.toISOString().slice(0, 10)
}
function addDaysKey(key: string, days: number): string {
  return keyFromUtc(new Date(utcFromKey(key).getTime() + days * 86400000))
}

function rruleFor(rule: string, dtstart: Date): RRule {
  const options = RRule.parseString(rule)
  options.dtstart = dtstart
  return new RRule(options)
}

/** Następne wystąpienie reguły w dniu `afterKey` lub później. YYYY-MM-DD. */
export function nextOccurrence(rule: string, afterKey: string): string | undefined {
  try {
    const after = utcFromKey(afterKey)
    const next = rruleFor(rule, after).after(after, true)
    return next ? keyFromUtc(next) : undefined
  } catch {
    return undefined
  }
}

/** Wszystkie wystąpienia w przedziale dni [fromKey, toKey] (włącznie). */
export function occurrencesBetween(
  rule: string,
  fromKey: string,
  toKey: string,
): string[] {
  try {
    const from = utcFromKey(fromKey)
    // koniec dnia toKey w UTC, by objąć wystąpienie o północy UTC tego dnia
    const to = new Date(utcFromKey(toKey).getTime() + 86400000 - 1000)
    // dtstart cofnięty o miesiąc, by nie ucinać reguł miesięcznych na starcie okna
    const dtstart = new Date(from.getTime() - 31 * 86400000)
    return rruleFor(rule, dtstart)
      .between(from, to, true)
      .map(keyFromUtc)
  } catch {
    return []
  }
}

/** Szablony, których najbliższe wystąpienie wypada w ciągu `days` dni od `fromKey`. */
export function upcomingTemplates(
  templates: RecurringTemplate[],
  fromKey: string,
  days = 14,
): { template: RecurringTemplate; nextDate: string }[] {
  const horizonKey = addDaysKey(fromKey, days)
  const out: { template: RecurringTemplate; nextDate: string }[] = []
  for (const t of templates) {
    if (!t.active) continue
    const next = nextOccurrence(t.rule, fromKey)
    if (next && next <= horizonKey) out.push({ template: t, nextDate: next })
  }
  return out.sort((a, b) => a.nextDate.localeCompare(b.nextDate))
}
