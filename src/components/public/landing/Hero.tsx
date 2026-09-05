// src/components/public/landing/Hero.tsx

import Link from 'next/link'
import { Newsreader } from 'next/font/google'
import { ArrowRightIcon, CompassIcon, CreditCardIcon, VideoIcon, ClipboardIcon } from '@/components/Icons'
import styles from './Hero.module.css'

const newsreader = Newsreader({ subsets: ['latin'], weight: ['500', '600'], style: ['italic', 'normal'] })

const FEATURE_CHIPS = [
  { icon: CreditCardIcon, label: 'Fees & payments via Paystack' },
  { icon: VideoIcon, label: 'Live classes' },
  { icon: ClipboardIcon, label: 'Results & report cards' },
]

export default function Hero() {
  return (
    <section className={styles.hero}>
      <div className={styles.inner}>
        <div className={styles.copy}>
          <h1 className={`${styles.headline} ${newsreader.className}`}>
            One portal. Every role, every term, every naira accounted for.
          </h1>
          <p className={styles.subhead}>
            Principals, teachers, bursars, secretaries, students and parents share one
            login and one live view of the term — attendance, results, fees and live
            classes, all in one place.
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
            {FEATURE_CHIPS.map(({ icon: Icon, label }) => (
              <span key={label} className={styles.chip}>
                <Icon size={13} /> {label}
              </span>
            ))}
          </div>
        </div>

        <div className={styles.cardWrap} aria-hidden="true">
          <div className={styles.reportCard}>
            <div className={styles.reportCardHeader}>
              <span className={styles.reportCardSchool}>Greenfield Secondary School</span>
              <span className={styles.reportCardTerm}>First Term &middot; 2025/2026</span>
            </div>
            <div className={styles.reportCardRow}>
              <span>Mathematics</span>
              <div className={styles.reportCardBar}><i style={{ width: '88%' }} /></div>
              <span className={styles.reportCardScore}>88</span>
            </div>
            <div className={styles.reportCardRow}>
              <span>English Language</span>
              <div className={styles.reportCardBar}><i style={{ width: '76%' }} /></div>
              <span className={styles.reportCardScore}>76</span>
            </div>
            <div className={styles.reportCardRow}>
              <span>Basic Science</span>
              <div className={styles.reportCardBar}><i style={{ width: '92%' }} /></div>
              <span className={styles.reportCardScore}>92</span>
            </div>
            <div className={styles.reportCardFooter}>
              <span className={styles.reportCardAttendance}>Attendance: 96%</span>
              <span className={styles.reportCardStamp}>Fees paid</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
