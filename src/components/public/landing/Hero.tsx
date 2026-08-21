// src/components/public/landing/Hero.tsx

import Link from 'next/link'
import { ArrowRightIcon, CompassIcon, CreditCardIcon, VideoIcon, ClipboardIcon } from '@/components/Icons'
import AnimatedLogo from '@/components/AnimatedLogo'
import motion from '@/components/dashboard-motion.module.css'
import styles from './Hero.module.css'

const FEATURE_CHIPS = [
  { icon: CreditCardIcon, label: 'Fees & payments via Paystack' },
  { icon: VideoIcon, label: 'Live classes' },
  { icon: ClipboardIcon, label: 'Results & report cards' },
]

export default function Hero() {
  return (
    <section className={styles.hero}>
      <div className={styles.glow} aria-hidden="true" />
      <div className={styles.inner}>
        <div className={`${styles.copy} ${motion.riseIn}`}>
          <span className="badge badge-brand">Built for Nigerian schools</span>
          <h1 className={styles.headline}>
            One school portal. <span className={styles.accent}>Every</span> role,
            every term, every naira accounted for.
          </h1>
          <p className={styles.subhead}>
            SchoolOS brings your principal, teachers, bursar, secretary, students and
            parents onto one platform: attendance, results, fees, live classes and
            communication, all in one place.
          </p>
          <div className={styles.ctaRow}>
            <Link href="/register-school" className="btn btn-primary btn-lg">
              Register your school <ArrowRightIcon size={16} />
            </Link>
            <Link href="/find-schools" className="btn btn-secondary btn-lg">
              <CompassIcon size={16} /> Find a school
            </Link>
          </div>
          <div className={styles.chipRow}>
            {FEATURE_CHIPS.map(({ icon: Icon, label }, i) => (
              <span
                key={label}
                className={`${styles.chip} ${motion.staggerItem}`}
                style={{ animationDelay: `${200 + i * 80}ms` }}
              >
                <Icon size={13} /> {label}
              </span>
            ))}
          </div>
        </div>

        <div className={`${styles.markWrap} ${motion.riseIn}`} style={{ animationDelay: '120ms' }} aria-hidden="true">
          <div className={styles.markGlow} />
          <AnimatedLogo size={220} />
        </div>
      </div>
    </section>
  )
}
