'use client'
// src/components/org/DepartmentCard.tsx
// Presentational only - no data fetching, no permission logic. The two
// pages that use this (vice-principal/departments and
// principal/leadership) each own their own fetch/mutate calls and just
// pass in what this card is allowed to let the user do, via which
// callback props are present. A callback left undefined means "hide that
// action" rather than "disable it" - keeps the card from ever rendering a
// button that would 403 if pressed.

import Link from 'next/link'
import { EditIcon, TrashIcon, UserIcon, CrownIcon, XIcon, ChevronRightIcon } from '@/components/Icons'
import motion from '@/components/dashboard-motion.module.css'
import styles from './DepartmentCard.module.css'
import type { DepartmentWithStats } from '@/lib/supabase/appointments'

interface Props {
  department: DepartmentWithStats
  detailHref?: string
  onEdit?: (department: DepartmentWithStats) => void
  onDelete?: (department: DepartmentWithStats) => void
  onAssignHod?: (department: DepartmentWithStats) => void
  onRevokeHod?: (department: DepartmentWithStats) => void
  onOpenMembers?: (department: DepartmentWithStats) => void
}

export default function DepartmentCard({
  department, detailHref, onEdit, onDelete, onAssignHod, onRevokeHod, onOpenMembers,
}: Props) {
  return (
    <div className={`${styles.card} glass-card ${motion.staggerItem}`}>
      <div className={styles.header}>
        <div>
          {detailHref ? (
            <Link href={detailHref} className={styles.nameLink}>
              <p className={styles.name}>{department.name}</p>
              <ChevronRightIcon size={13} />
            </Link>
          ) : (
            <p className={styles.name}>{department.name}</p>
          )}
          {department.description && <p className={styles.description}>{department.description}</p>}
        </div>
        <div className={styles.headerActions}>
          {onEdit && (
            <button className={`${styles.iconBtn} ${motion.rippleHost}`} onClick={() => onEdit(department)} title="Edit department" aria-label="Edit department">
              <EditIcon size={14} />
            </button>
          )}
          {onDelete && (
            <button className={`${styles.iconBtn} ${styles.danger} ${motion.rippleHost}`} onClick={() => onDelete(department)} title="Delete department" aria-label="Delete department">
              <TrashIcon size={14} />
            </button>
          )}
        </div>
      </div>

      <button
        type="button"
        className={styles.hodRow}
        onClick={() => onOpenMembers?.(department)}
        disabled={!onOpenMembers}
      >
        <span className={styles.hodIcon}><CrownIcon size={13} /></span>
        {department.hod ? (
          <span className={styles.hodName}>{department.hod.full_name}</span>
        ) : (
          <span className={styles.hodMissing}>No Head of Department assigned</span>
        )}
      </button>

      <div className={styles.footer}>
        <span className={styles.memberCount}>
          <UserIcon size={12} /> {department.member_count} member{department.member_count === 1 ? '' : 's'}
        </span>
        <div className={styles.footerActions}>
          {onAssignHod && (
            <button className={`${styles.pillBtn} ${motion.rippleHost}`} onClick={() => onAssignHod(department)}>
              {department.hod ? 'Change HOD' : 'Assign HOD'}
            </button>
          )}
          {onRevokeHod && department.hod && (
            <button className={`${styles.pillBtn} ${styles.pillDanger} ${motion.rippleHost}`} onClick={() => onRevokeHod(department)}>
              <XIcon size={11} /> Revoke
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
