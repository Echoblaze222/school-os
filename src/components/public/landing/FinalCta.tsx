// src/components/public/landing/FinalCta.tsx

import Link from 'next/link'
import { ArrowRightIcon } from '@/components/Icons'
import styles from './FinalCta.module.css'

export default function FinalCta() {
  return (
    <section className="page-content">
      <div className={styles.card}>
        <div className={styles.glow} aria-hidden="true" />
        <h2 className={styles.title}>Ready to bring your school onto SchoolOS?</h2>
        <p className={styles.subtitle}>
          Registration takes a few minutes. Your portal is ready as soon as setup is complete.
        </p>
        <Link href="/register-school" className="btn btn-lg" style={{ background: '#fff', color: 'var(--brand)' }}>
          Register your school <ArrowRightIcon size={16} />
        </Link>
      </div>
    </section>
  )
}
