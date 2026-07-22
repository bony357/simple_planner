import { db } from '../db/dexie'
import { useSettings } from '../store/useSettings'
import { todayISO } from '../lib/dates'
import { describeRule, upcomingTemplates } from './recurrence'

/**
 * Pobierz listę modeli dostępnych dla danego klucza API, które wspierają
 * generowanie treści (generateContent). Pozwala wybrać poprawny model w UI.
 */
export async function listGeminiModels(): Promise<string[]> {
  const { geminiApiKey } = useSettings.getState()
  if (!geminiApiKey.trim()) {
    throw new Error('Brak klucza Gemini API — uzupełnij w Ustawieniach.')
  }
  const { GoogleGenAI } = await import('@google/genai')
  const ai = new GoogleGenAI({ apiKey: geminiApiKey.trim() })

  const names: string[] = []
  // queryBase: true → modele bazowe (dostępne do użycia), nie strojone.
  const pager = await ai.models.list({ config: { queryBase: true } })
  for await (const m of pager) {
    const model = m as {
      name?: string
      supportedActions?: string[]
      supportedGenerationMethods?: string[]
    }
    const actions = model.supportedActions ?? model.supportedGenerationMethods
    // Bez listy metod przyjmujemy, że model nadaje się do generowania.
    if (!actions || actions.includes('generateContent')) {
      const name = (model.name ?? '').replace(/^models\//, '')
      if (name) names.push(name)
    }
  }
  return names.sort()
}

export type SuggestionAction =
  | 'addTask'
  | 'modifyTask'
  | 'completeTask'
  | 'remindRecurring'

export interface Suggestion {
  action: SuggestionAction
  title: string
  taskId?: string
  categoryName?: string
  dueDate?: string
  notes?: string
  reason: string
}

// Schemat opisany literałami stringów (wartości enuma Type z SDK), aby nie
// wymuszać statycznego importu ciężkiego SDK — ładujemy go dynamicznie niżej.
const responseSchema = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING' },
    suggestions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          action: {
            type: 'STRING',
            enum: ['addTask', 'modifyTask', 'completeTask', 'remindRecurring'],
          },
          title: { type: 'STRING' },
          taskId: { type: 'STRING' },
          categoryName: { type: 'STRING' },
          dueDate: { type: 'STRING' },
          notes: { type: 'STRING' },
          reason: { type: 'STRING' },
        },
        required: ['action', 'title', 'reason'],
      },
    },
  },
  required: ['summary', 'suggestions'],
} as const

const SYSTEM = `Jesteś asystentem planowania dnia. Analizujesz zadania użytkownika i proponujesz konkretne, praktyczne działania.
Zasady:
- Odpowiadaj po polsku.
- Proponuj tylko sensowne, nieduplikujące się zadania.
- Dla zadań cyklicznych (np. rachunki) użyj action "remindRecurring".
- Gdy sugerujesz zmianę istniejącego zadania, podaj jego taskId.
- Pole dueDate w formacie YYYY-MM-DD.
- Każda sugestia musi mieć krótkie uzasadnienie (reason).
- Nie wykonuj żadnych zmian — tylko proponuj. Użytkownik zatwierdza ręcznie.`

/** Zbuduj kontekst dla modelu z bieżącego stanu bazy. */
async function buildContext(): Promise<string> {
  const [tasks, categories, templates] = await Promise.all([
    db.tasks.toArray(),
    db.categories.toArray(),
    db.recurringTemplates.toArray(),
  ])
  const today = todayISO()
  const catName = (id?: string) =>
    categories.find((c) => c.id === id)?.name ?? 'brak'

  const todo = tasks
    .filter((t) => t.status === 'todo')
    .map((t) => `- [${t.id}] "${t.title}" (kat: ${catName(t.categoryId)}, termin: ${t.dueDate ?? 'brak'})`)
  const doneRecently = tasks
    .filter((t) => t.status === 'done' && t.completedAt && t.completedAt.slice(0, 10) >= addDays(today, -7))
    .map((t) => `- "${t.title}" (ukończone ${t.completedAt?.slice(0, 10)})`)
  const recurring = upcomingTemplates(templates, today, 14).map(
    (r) => `- "${r.template.title}" (${describeRule(r.template.rule)}) wypada ${r.nextDate}`,
  )

  return [
    `Dzisiejsza data: ${today}`,
    `Dostępne kategorie: ${categories.map((c) => c.name).join(', ') || 'brak'}`,
    ``,
    `Zadania do zrobienia (${todo.length}):`,
    todo.join('\n') || '(brak)',
    ``,
    `Ukończone w ostatnim tygodniu:`,
    doneRecently.join('\n') || '(brak)',
    ``,
    `Nadchodzące zadania cykliczne:`,
    recurring.join('\n') || '(brak)',
  ].join('\n')
}

export interface AssistantResult {
  summary: string
  suggestions: Suggestion[]
}

export async function askAssistant(userPrompt?: string): Promise<AssistantResult> {
  const { geminiApiKey, geminiModel } = useSettings.getState()
  if (!geminiApiKey.trim()) {
    throw new Error('Brak klucza Gemini API — uzupełnij w Ustawieniach.')
  }

  // Dynamiczny import — SDK trafia do osobnego chunku, ładowanego dopiero teraz.
  const { GoogleGenAI } = await import('@google/genai')
  const ai = new GoogleGenAI({ apiKey: geminiApiKey.trim() })
  const context = await buildContext()
  const prompt = [
    context,
    '',
    userPrompt
      ? `Prośba użytkownika: ${userPrompt}`
      : 'Przejrzyj powyższe i zaproponuj co dodać, zmienić lub o czym pamiętać.',
  ].join('\n')

  const response = await ai.models.generateContent({
    model: geminiModel || 'gemini-2.5-flash',
    contents: prompt,
    config: {
      systemInstruction: SYSTEM,
      responseMimeType: 'application/json',
      // Cast: schemat opisany literałami zgodnymi z enumem Type SDK.
      responseSchema: responseSchema as unknown as Record<string, unknown>,
    },
  })

  const text = response.text ?? '{}'
  const parsed = JSON.parse(text) as AssistantResult
  return {
    summary: parsed.summary ?? '',
    suggestions: parsed.suggestions ?? [],
  }
}

function addDays(dateKey: string, days: number): string {
  return new Date(new Date(dateKey).getTime() + days * 86400000)
    .toISOString()
    .slice(0, 10)
}
