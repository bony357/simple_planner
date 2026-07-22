import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/dexie'
import { addCategory, deleteCategory, updateCategory } from '../../db/repo'
import styles from './CategoryManager.module.css'

const PALETTE = [
  'var(--cat-1)',
  'var(--cat-2)',
  'var(--cat-3)',
  'var(--cat-4)',
  'var(--cat-5)',
  'var(--cat-6)',
]

export default function CategoryManager() {
  const categories =
    useLiveQuery(() => db.categories.orderBy('order').toArray(), [], []) ?? []
  const [name, setName] = useState('')
  const [color, setColor] = useState(PALETTE[0])

  const add = async () => {
    if (!name.trim()) return
    await addCategory(name, color)
    setName('')
  }

  return (
    <div className={styles.wrap}>
      {categories.map((c) => (
        <div key={c.id} className={styles.row}>
          <div className={styles.swatches}>
            {PALETTE.map((p) => (
              <button
                key={p}
                className={styles.swatch}
                style={{ background: p }}
                data-active={c.color === p}
                aria-label="Kolor"
                onClick={() => updateCategory(c.id, { color: p })}
              />
            ))}
          </div>
          <input
            className="input"
            value={c.name}
            onChange={(e) => updateCategory(c.id, { name: e.target.value })}
          />
          <button
            className="btn btn-danger btn-icon"
            aria-label="Usuń kategorię"
            onClick={() => deleteCategory(c.id)}
          >
            🗑
          </button>
        </div>
      ))}

      <div className={styles.row}>
        <div className={styles.swatches}>
          {PALETTE.map((p) => (
            <button
              key={p}
              className={styles.swatch}
              style={{ background: p }}
              data-active={color === p}
              aria-label="Kolor"
              onClick={() => setColor(p)}
            />
          ))}
        </div>
        <input
          className="input"
          placeholder="Nowa kategoria…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button className="btn btn-primary btn-icon" aria-label="Dodaj" onClick={add}>
          +
        </button>
      </div>
    </div>
  )
}
