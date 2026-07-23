import type { Category, Task } from '../../db/types'
import { toggleTaskDone } from '../../db/repo'
import styles from './TaskItem.module.css'

interface TaskItemProps {
  task: Task
  category?: Category
  onEdit?: (t: Task) => void
  /** Włącza atrybuty przeciągania na kalendarz (data-* czytane przez Draggable). */
  draggable?: boolean
}

export default function TaskItem({ task, category, onEdit, draggable }: TaskItemProps) {
  const done = task.status === 'done'
  const fromCalendar = !!task.sourceEventId

  return (
    <div
      className={`${styles.item} fc-draggable-task`}
      data-task-id={task.id}
      data-task-title={task.title}
      data-task-color={category?.color ?? ''}
      data-draggable={draggable ? 'true' : 'false'}
    >
      {fromCalendar && (
        <span
          className={styles.calBadge}
          aria-label="Z kalendarza"
          title="Z kalendarza"
        >
          📅
        </span>
      )}

      <button
        className={styles.check}
        aria-label={done ? 'Odznacz' : 'Oznacz jako wykonane'}
        onClick={() => toggleTaskDone(task)}
        data-done={done}
      >
        {done ? '✓' : ''}
      </button>

      <button
        className={styles.body}
        onClick={() => onEdit?.(task)}
        disabled={!onEdit}
      >
        <span className={`${styles.title} ${done ? styles.doneTitle : ''}`}>
          {task.title}
        </span>
      </button>

      {draggable && <span className={styles.grip} aria-hidden>⠿</span>}
    </div>
  )
}
