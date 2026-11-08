// src/components/public/landing/SchoolLife.tsx
// Photo section: pupils, classrooms and school life, each image cut into an
// organic blob shape (pre-masked WebP with transparency, see public/landing)
// with a short caption underneath. Captions only describe features that
// already exist in the product.

import Image from 'next/image'
import motion from '@/components/dashboard-motion.module.css'
import styles from './SchoolLife.module.css'

const MOMENTS = [
  {
    file: 'hero-school-entrance',
    audience: 'Schools',
    title: 'A school day that starts well',
    body: 'Safe, organised and ready from the first bell. Everything your school needs runs quietly in the background.',
    alt: 'Pupils in uniform walking toward a modern school building at sunrise',
  },
  {
    file: 'student-speaker',
    audience: 'Children',
    title: 'Confident voices, bold futures',
    body: 'Every child deserves a stage. When admin work is handled, teachers have more time to build confidence in their pupils.',
    alt: 'A schoolgirl in a blazer speaking into a microphone',
  },
  {
    file: 'classroom-maths',
    audience: 'Schools',
    title: 'Numbers that add up',
    body: 'Scores, report cards and broadsheets stay accurate and arrive on time, every term.',
    alt: 'A teacher at a blackboard teaching a full classroom of students',
  },
  {
    file: 'raised-hand',
    audience: 'Parents',
    title: 'Every hand counts',
    body: 'Teachers see attendance, assignments and progress in one place, so no child is overlooked.',
    alt: 'A pupil raising her hand to answer a teacher\u2019s question',
  },
  {
    file: 'happy-student',
    audience: 'Children',
    title: 'Learning they look forward to',
    body: 'Assignments, notes and live classes sit in one app, so your child always knows what is next.',
    alt: 'A smiling girl in a yellow jacket celebrating in class',
  },
  {
    file: 'library-reading',
    audience: 'Schools',
    title: 'Curious minds, shared stories',
    body: 'Library loans and records are tracked, so books keep moving from shelf to student.',
    alt: 'Four pupils reading books together in the school library',
  },
  {
    file: 'smiling-class',
    audience: 'Parents',
    title: 'Your child, in good hands',
    body: 'Parents see attendance, results and school notices as they happen, without a trip to the office.',
    alt: 'A smiling pupil sitting at her desk in a full classroom',
  },
  {
    file: 'focused-pupil',
    audience: 'Parents',
    title: 'Fees made simple',
    body: 'Pay school fees by Paystack, upload proof when needed, and get a confirmation straight away.',
    alt: 'A young pupil writing in her exercise book at her desk',
  },
  {
    file: 'pupil-portrait',
    audience: 'Children',
    title: 'Proud to belong',
    body: 'Each pupil has their own login and profile, with their records kept private and safe.',
    alt: 'A smiling pupil in school uniform seated in a classroom',
  },
]

export default function SchoolLife() {
  return (
    <section className="page-content">
      <div className={styles.headingRow}>
        <h2 className="h2">Built around the people in your school</h2>
        <p className="body">
          Parents want to know their child is doing well. Teachers want time to teach.
          Principals want a school that runs on time. SchoolOS is made for all three.
        </p>
      </div>

      <div className={styles.grid}>
        {MOMENTS.map(({ file, audience, title, body, alt }, i) => (
          <figure
            key={file}
            className={`${styles.item} ${motion.staggerItem}`}
            style={{ animationDelay: `${(i % 3) * 70}ms` }}
          >
            <Image
              src={`/landing/${file}.webp`}
              alt={alt}
              width={900}
              height={900}
              sizes="(min-width: 1024px) 320px, (min-width: 640px) 45vw, 90vw"
              className={styles.blob}
              loading="lazy"
            />
            <figcaption className={styles.caption}>
              <span className={styles.audience}>{audience}</span>
              <h3 className="h4">{title}</h3>
              <p className="body">{body}</p>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  )
}
