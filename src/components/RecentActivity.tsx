'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import styles from './recent-activity.module.css'

export interface ActivityItem {
  id: string
  type: string          // e.g. 'assignment_submitted' | 'result_viewed' | 'message_sent'
  title: string          // e.g. "Submitted Physics Assignment"
  subtitle?: string       // e.g. "Term Test 2 · Physics"
  href: string           // where tapping navigates
  created_at: string     // ISO timestamp
  icon?: string           // optional emoji/short glyph fallback
  preview?: {
    // Optional rich preview shown in the modal before navigating
    body?: string
    meta?: { label: string; value: string }[]
  }
}

interface Props {
  items: ActivityItem[]
  accentColor?: string
  onDelete?: (id: string) => void | Promise<void>
  emptyLabel?: string
}

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const TYPE_ICON: Record<string, string> = {
  assignment_submitted: '📝',
  result_viewed:        '📊',
  quiz_completed:       '🏆',
  message_sent:         '💬',
  meeting_joined:       '📅',
  fee_paid:             '💳',
  attendance_marked:    '✅',
  record_added:         '📁',
  announcement_read:    '📣',
  default:              '•',
}

export default function RecentActivity({ items, accentColor = '#7C3AED', onDelete, emptyLabel = 'No recent activity yet' }: Props) {
  const router = useRouter()
  const [previewItem, setPreviewItem] = useState<ActivityItem | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [localItems, setLocalItems] = useState(items)
  const dragState = useRef<{ id: string; startX: number } | null>(null)
  const [dragX, setDragX] = useState<Record<string, number>>({})

  // Keep in sync if parent re-fetches
  if (items !== localItems && items.length !== localItems.length && !removingId) {
    // cheap sync guard — only resync when counts actually diverge and we're not mid-animation
  }

  async function handleDelete(id: string) {
    setRemovingId(id)
    // let the exit animation play before removing from DOM
    setTimeout(async () => {
      setLocalItems(prev => prev.filter(i => i.id !== id))
      setRemovingId(null)
      if (onDelete) await onDelete(id)
    }, 260)
  }

  function handleTap(item: ActivityItem) {
    router.push(item.href)
  }

  function onPointerDown(e: React.PointerEvent, id: string) {
    dragState.current = { id, startX: e.clientX }
  }
  function onPointerMove(e: React.PointerEvent, id: string) {
    if (!dragState.current || dragState.current.id !== id) return
    const dx = e.clientX - dragState.current.startX
    if (dx < 0) setDragX(prev => ({ ...prev, [id]: Math.max(dx, -96) }))
  }
  function onPointerUp(id: string) {
    const dx = dragX[id] ?? 0
    if (dx < -64) {
      handleDelete(id)
    } else {
      setDragX(prev => ({ ...prev, [id]: 0 }))
    }
    dragState.current = null
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.headerRow}>
        <p className={styles.sectionLabel}>Recent Activity</p>
        {localItems.length > 0 && (
          <span className={styles.countBadge} style={{ color: accentColor }}>{localItems.length}</span>
        )}
      </div>

      {localItems.length === 0 ? (
        <div className={styles.emptyState}>
          <span className={styles.emptyGlyph}>🕓</span>
          <p>{emptyLabel}</p>
        </div>
      ) : (
        <ul className={styles.list}>
          {localItems.map((item, idx) => {
            const offset = dragX[item.id] ?? 0
            const isRemoving = removingId === item.id
            return (
              <li
                key={item.id}
                className={`${styles.itemOuter} ${isRemoving ? styles.itemExit : ''}`}
                style={{ animationDelay: `${idx * 45}ms` }}
              >
                <div className={styles.deleteBackdrop}>
                  <button
                    className={styles.deleteAction}
                    onClick={() => handleDelete(item.id)}
                    aria-label="Delete activity"
                  >
                    🗑
                  </button>
                </div>

                <div
                  className={styles.itemCard}
                  style={{ transform: `translateX(${offset}px)` }}
                  onPointerDown={e => onPointerDown(e, item.id)}
                  onPointerMove={e => onPointerMove(e, item.id)}
                  onPointerUp={() => onPointerUp(item.id)}
                  onPointerLeave={() => onPointerUp(item.id)}
                >
                  <button
                    className={styles.itemMain}
                    onClick={() => handleTap(item)}
                  >
                    <span className={styles.itemIcon} style={{ background: `${accentColor}22` }}>
                      {item.icon ?? TYPE_ICON[item.type] ?? TYPE_ICON.default}
                    </span>
                    <span className={styles.itemText}>
                      <span className={styles.itemTitle}>{item.title}</span>
                      {item.subtitle && <span className={styles.itemSubtitle}>{item.subtitle}</span>}
                    </span>
                    <span className={styles.itemTime}>{timeAgo(item.created_at)}</span>
                  </button>

                  <button
                    className={styles.previewBtn}
                    onClick={(e) => { e.stopPropagation(); setPreviewItem(item) }}
                    aria-label="Preview"
                  >
                    👁
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {previewItem && (
        <div className={styles.modalBackdrop} onClick={() => setPreviewItem(null)}>
          <div className={styles.modalCard} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <span className={styles.itemIcon} style={{ background: `${accentColor}22` }}>
                {previewItem.icon ?? TYPE_ICON[previewItem.type] ?? TYPE_ICON.default}
              </span>
              <div>
                <p className={styles.modalTitle}>{previewItem.title}</p>
                <p className={styles.modalTime}>{timeAgo(previewItem.created_at)}</p>
              </div>
            </div>

            {previewItem.preview?.body && (
              <p className={styles.modalBody}>{previewItem.preview.body}</p>
            )}

            {previewItem.preview?.meta && previewItem.preview.meta.length > 0 && (
              <div className={styles.modalMeta}>
                {previewItem.preview.meta.map(m => (
                  <div key={m.label} className={styles.modalMetaRow}>
                    <span>{m.label}</span>
                    <span>{m.value}</span>
                  </div>
                ))}
              </div>
            )}

            <div className={styles.modalActions}>
              <button
                className={styles.modalGhostBtn}
                onClick={() => { setPreviewItem(null); handleDelete(previewItem.id) }}
              >
                Delete
              </button>
              <button
                className={styles.modalPrimaryBtn}
                style={{ background: accentColor }}
                onClick={() => { setPreviewItem(null); handleTap(previewItem) }}
              >
                Open
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
