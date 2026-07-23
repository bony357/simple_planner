/**
 * Na tablecie e-ink Onyx Boox pełnoekranowa nakładka handwriting jest częścią
 * systemowego IME i pojawia się tylko wtedy, gdy pole tekstowe ma focus. Problem
 * w tym, że przeglądarka nie zawsze zdejmuje focus z inputa, gdy dotkniemy
 * rysikiem czegoś innego — przez co nakładka (i przechwytywanie rysika) zostaje
 * aktywna na całym ekranie.
 *
 * Ten listener wymusza `blur()` na aktywnym polu tekstowym w momencie, gdy rysik
 * dotknie czegokolwiek poza polem tekstowym (i jego etykietą). Efekt: handwriting
 * działa wyłącznie przy aktywnym inpucie, a poza nim rysik wraca do roli
 * wskaźnika/dotyku.
 */

// Elementy, dotknięcie których NIE powinno zdejmować focusu z pola tekstowego:
// inne pola tekstowe (przełączenie focusu) oraz etykieta (klik w label i tak
// przenosi focus na powiązany input — blur spowodowałby tylko migotanie).
const KEEP_FOCUS_SELECTOR = 'input, textarea, [contenteditable="true"], label'

function isTextField(el: Element | null): el is HTMLElement {
  if (!el) return false
  return (
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    (el as HTMLElement).isContentEditable
  )
}

function handlePointerDown(event: PointerEvent) {
  const active = document.activeElement
  if (!isTextField(active)) return

  const target = event.target as Element | null
  if (target && target.closest(KEEP_FOCUS_SELECTOR)) return

  active.blur()
}

/**
 * Instaluje globalny listener. Faza przechwytywania (capture) gwarantuje, że
 * zdarzenie złapiemy zanim inny handler zdąży je zatrzymać (np. `stopPropagation`).
 * Zwraca funkcję odpinającą — przydatną w testach; w aplikacji wołamy raz przy starcie.
 */
export function installBlurOnOutsideTap(): () => void {
  document.addEventListener('pointerdown', handlePointerDown, true)
  return () => document.removeEventListener('pointerdown', handlePointerDown, true)
}
