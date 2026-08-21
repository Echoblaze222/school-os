'use client'
// src/app/schools/[slug]/ProfileClient.tsx

import { useState } from 'react'
import {
  MapPinIcon, CheckCircleIcon, GlobeIcon, MailIcon, PhoneIcon,
  CalendarIcon, HomeIcon, GraduationCapIcon, BookOpenIcon,
  AwardIcon, MessageIcon, SchoolIcon,
} from '@/components/Icons'
import EmptyState from '@/components/motion/EmptyState'
import InquiryModal from '@/components/public/InquiryModal'
import ReportContentButton from '@/components/ReportContentButton'
import type { PublicSchoolProfile } from '@/lib/publicSchools'
import motion from '@/components/dashboard-motion.module.css'
import styles from './profile.module.css'

interface SchoolEvent {
  id: string
  title: string
  event_type: string | null
  start_date: string
  end_date: string | null
  description: string | null
  all_day: boolean
}

const ADMISSION_LABEL: Record<string, { label: string; badgeClass: string }> = {
  open:     { label: 'Admissions open',    badgeClass: 'badge-success' },
  waitlist: { label: 'Waitlist only',      badgeClass: 'badge-gold' },
  closed:   { label: 'Admissions closed',  badgeClass: 'badge-muted' },
}

export default function ProfileClient({ school, events }: { school: PublicSchoolProfile; events: SchoolEvent[] }) {
  const [inquiryOpen, setInquiryOpen] = useState(false)
  const admission = ADMISSION_LABEL[school.admission_status] ?? ADMISSION_LABEL.closed
  const location = [school.city, school.state].filter(Boolean).join(', ')

  return (
    <div>
      {/* ── Cover + header ─────────────────────────────────────── */}
      <div
        className={styles.coverBanner}
        style={{
          backgroundImage: school.cover_image_url ? `url(${school.cover_image_url})` : undefined,
          backgroundColor: school.cover_image_url ? undefined : (school.primary_color || 'var(--brand)'),
        }}
      />

      <div className="page-content">
        <div className={`${styles.headerCard} ${motion.riseIn}`}>
          <div
            className={styles.logo}
            style={{ background: school.logo_url ? 'var(--bg-elevated)' : (school.primary_color || 'var(--brand)') }}
          >
            {school.logo_url ? <img src={school.logo_url} alt="" /> : <SchoolIcon size={30} color="#fff" />}
          </div>

          <div className={styles.headerText}>
            <div className={styles.nameRow}>
              <h1 className="h2">{school.name}</h1>
              {school.verified_status === 'verified' && (
                <span className={`badge badge-success ${styles.inlineBadge}`}>
                  <CheckCircleIcon size={12} /> Verified
                </span>
              )}
            </div>
            {school.tagline && <p className={styles.tagline}>{school.tagline}</p>}
            <div className={styles.metaRow}>
              {location && <span className={styles.metaItem}><MapPinIcon size={13} /> {location}</span>}
              <span className={styles.metaItem}>
                <HomeIcon size={13} />
                {school.is_boarding && school.is_day ? 'Boarding & Day' : school.is_boarding ? 'Boarding' : 'Day'}
              </span>
              {school.founded_year && (
                <span className={styles.metaItem}><CalendarIcon size={13} /> Est. {school.founded_year}</span>
              )}
            </div>
          </div>

          <div className={styles.headerActions}>
            <span className={`badge ${admission.badgeClass}`}>{admission.label}</span>
            <button
              type="button"
              className={`btn btn-primary ${motion.pressable} ${motion.focusable}`}
              onClick={() => setInquiryOpen(true)}
            >
              <MessageIcon size={15} /> Ask a question
            </button>
            <ReportContentButton targetType="school" targetId={school.id} />
          </div>
        </div>

        <div className={styles.layout}>
          <div className={styles.main}>
            {school.description && (
              <section className={`${styles.section} glass-card`}>
                <h2 className="h3">About {school.name}</h2>
                <p className={styles.description}>{school.description}</p>
              </section>
            )}

            {school.education_levels.length > 0 && (
              <section className={`${styles.section} glass-card`}>
                <h2 className="h3"><GraduationCapIcon size={17} /> Education levels</h2>
                <div className={styles.tagGrid}>
                  {school.education_levels.map(level => (
                    <span key={level} className="badge badge-brand">{level}</span>
                  ))}
                </div>
              </section>
            )}

            {school.programs.length > 0 && (
              <section className={`${styles.section} glass-card`}>
                <h2 className="h3"><BookOpenIcon size={17} /> Programs</h2>
                <div className={styles.tagGrid}>
                  {school.programs.map(program => (
                    <span key={program} className="badge badge-muted">{program}</span>
                  ))}
                </div>
              </section>
            )}

            {school.facilities.length > 0 && (
              <section className={`${styles.section} glass-card`}>
                <h2 className="h3"><AwardIcon size={17} /> Facilities</h2>
                <div className={styles.tagGrid}>
                  {school.facilities.map(facility => (
                    <span key={facility} className="badge badge-muted">{facility}</span>
                  ))}
                </div>
              </section>
            )}

            <section className={`${styles.section} glass-card`}>
              <h2 className="h3"><CalendarIcon size={17} /> Upcoming events</h2>
              {events.length === 0 ? (
                <EmptyState
                  icon={<CalendarIcon size={24} />}
                  title="No upcoming events"
                  subtitle={`${school.name} hasn\u2019t published any public events yet.`}
                />
              ) : (
                <div className={styles.eventList}>
                  {events.map(event => (
                    <div key={event.id} className={styles.eventRow}>
                      <div className={styles.eventDate}>
                        {new Date(event.start_date).toLocaleDateString('en-NG', { day: '2-digit', month: 'short' })}
                      </div>
                      <div>
                        <p className={styles.eventTitle}>{event.title}</p>
                        {event.description && <p className={styles.eventDesc}>{event.description}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <aside className={styles.sidebar}>
            <div className={`${styles.section} glass-card`}>
              <h2 className="h4">Admissions</h2>
              <p className={styles.sidebarLine}>
                <span className={`badge ${admission.badgeClass}`}>{admission.label}</span>
              </p>
              {school.application_deadline && (
                <p className={styles.sidebarDetail}>
                  Application deadline: {new Date(school.application_deadline).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              )}
              <button
                type="button"
                className={`btn btn-secondary ${motion.pressable} ${motion.focusable}`}
                style={{ width: '100%', marginTop: 'var(--space-3)' }}
                onClick={() => setInquiryOpen(true)}
              >
                Request information
              </button>
            </div>

            {(school.public_email || school.public_phone || school.website_url || Object.keys(school.social_links || {}).length > 0) && (
              <div className={`${styles.section} glass-card`}>
                <h2 className="h4">Contact</h2>
                <div className={styles.contactList}>
                  {school.public_email && (
                    <a href={`mailto:${school.public_email}`} className={styles.contactRow}>
                      <MailIcon size={15} /> {school.public_email}
                    </a>
                  )}
                  {school.public_phone && (
                    <a href={`tel:${school.public_phone}`} className={styles.contactRow}>
                      <PhoneIcon size={15} /> {school.public_phone}
                    </a>
                  )}
                  {school.website_url && (
                    <a href={school.website_url} target="_blank" rel="noopener noreferrer" className={styles.contactRow}>
                      <GlobeIcon size={15} /> Visit website
                    </a>
                  )}
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>

      {inquiryOpen && (
        <InquiryModal
          schoolSlug={school.slug}
          schoolName={school.name}
          onClose={() => setInquiryOpen(false)}
        />
      )}
    </div>
  )
}
