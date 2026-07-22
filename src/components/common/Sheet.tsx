import { type ReactNode, useEffect } from 'react'
import styles from './Sheet.module.css'

interface SheetProps {
  open: boolean
  title?: string
  onClose: () => void
  children: ReactNode
}

/** Dolny arkusz (bottom sheet) — dotykowa alternatywa dla modala. */
export default function Sheet({ open, title, onClose, children }: SheetProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className={styles.backdrop} onClick={onClose}>
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
