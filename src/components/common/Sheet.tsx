import { type ReactNode, useEffect, useRef, useState } from 'react'
import styles from './Sheet.module.css'

interface SheetProps {
  open: boolean
  title?: string
  onClose: () => void
  children: ReactNode
}

/** Dolny arkusz (bottom sheet) — dotykowa alternatywa dla modala. */
export default function Sheet({ open, title, onClose, children }: SheetProps) {
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  // Zamiast puszczać gest "wstecz" przez cały stos historii przeglądarki,
  // otwarcie arkusza dokłada jeden wpis historii — gest "wstecz" tylko go zamyka.
  useEffect(() => {
    if (!open) return
    let poppedByBack = false
    window.history.pushState({ sheetOpen: true }, '')
    const onPopState = () => {
      poppedByBack = true
      onCloseRef.current()
    }
    window.addEventListener('popstate', onPopState)
    return () => {
      window.removeEventListener('popstate', onPopState)
      if (!poppedByBack) window.history.back()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Klawiatura ekranowa: mierzymy jej wysokość przez visualViewport i unosimy
  // arkusz o tyle w górę, żeby pola formularza nie chowały się za klawiaturą.
  const [keyboardInset, setKeyboardInset] = useState(0)
  useEffect(() => {
    if (!open) return
    const vv = window.visualViewport
    if (!vv) return
    const update = () => {
      const overlap = window.innerHeight - (vv.height + vv.offsetTop)
      setKeyboardInset(Math.max(0, Math.round(overlap)))
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      setKeyboardInset(0)
    }
  }, [open])

  if (!open) return null
  return (
    <div
      className={styles.backdrop}
      onClick={onClose}
      style={{ paddingBottom: keyboardInset }}
    >
      <div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.grabber} />
        {title && <div className={styles.header}>{title}</div>}
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  )
}
