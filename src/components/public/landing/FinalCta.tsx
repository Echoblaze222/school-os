// src/components/public/landing/FinalCta.tsx

import Link from 'next/link'
import Image from 'next/image'
import { ArrowRightIcon } from '@/components/Icons'
import styles from './FinalCta.module.css'

export default function FinalCta() {
  return (
    <section className="page-content">
      <div className={styles.card}>
        <div className={styles.glow} aria-hidden="true" />
        <figure className={styles.figure}>
          <Image
            src="/landing/student-speaker.webp"
            alt="A schoolgirl in a blazer speaking confidently into a microphone"
            width={900}
            height={900}
            sizes="(min-width: 900px) 240px, 160px"
            className={styles.blob}
            loading="lazy"
          />
        </figure>
        <div className={styles.content}>
          <h2 className={styles.title}>Ready to bring your school onto SchoolOS?</h2>
          <p className={styles.subtitle}>
            Give your teachers their time back and your pupils the best chance to be heard.
            Registration takes a few minutes, and your portal is ready as soon as setup is complete.
          </p>
          <Link href="/register-school" className={`btn btn-lg ${styles.ctaButton}`}>
            Register your school <ArrowRightIcon size={16} />
          </Link>
        </div>
      </div>
    </section>
  )
}
