// src/components/public/landing/FeatureBand.tsx
// One blob-shaped photo beside a short explanation of how SchoolOS helps.
// Used as a standalone band between other landing sections so photos are
// spread through the page instead of grouped in a gallery. Images are
// pre-masked transparent WebP files in public/landing.

import Image from 'next/image'
import styles from './FeatureBand.module.css'

type Props = {
  image: string
  alt: string
  caption: string
  label: string
  title: string
  body: string
  reverse?: boolean
}

export default function FeatureBand({ image, alt, caption, label, title, body, reverse }: Props) {
  return (
    <section className="page-content">
      <div className={`${styles.band} ${reverse ? styles.reverse : ''}`}>
        <figure className={styles.figure}>
          <Image
            src={`/landing/${image}.webp`}
            alt={alt}
            width={900}
            height={900}
            sizes="(min-width: 900px) 380px, 70vw"
            className={styles.blob}
            loading="lazy"
          />
          <figcaption className={styles.caption}>{caption}</figcaption>
        </figure>
        <div className={styles.copy}>
          <span className={styles.label}>{label}</span>
          <h2 className="h2">{title}</h2>
          <p className="body">{body}</p>
        </div>
      </div>
    </section>
  )
}
