// src/components/public/landing/FeatureBand.tsx
// One blob-shaped photo beside a short explanation of how SchoolOS helps.
// Used as a standalone band between other landing sections so photos are
// spread through the page instead of grouped in a gallery. Images are
// pre-masked transparent files in public/branding (pass the full path).

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

// Sizing is inline (not only in the CSS module) so the blob can never be
// stretched into an oval by a missing or stale stylesheet: width/height
// attributes alone would render the 900px-tall image at full height.
const BLOB_STYLE = {
  width: '100%',
  maxWidth: 340,
  height: 'auto',
  aspectRatio: '1 / 1',
  objectFit: 'contain',
} as const

export default function FeatureBand({ image, alt, caption, label, title, body, reverse }: Props) {
  return (
    <section className="page-content">
      <div className={`${styles.band} ${reverse ? styles.reverse : ''}`}>
        <figure className={styles.figure}>
          <Image
            src={image}
            alt={alt}
            width={900}
            height={900}
            sizes="(min-width: 900px) 340px, 70vw"
            className={styles.blob}
            style={BLOB_STYLE}
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
