'use client'
// src/app/dashboard/applications/[id]/ApplicationDetailClient.tsx

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeftIcon, SendIcon, CheckCircleIcon, ClockIcon, SchoolIcon } from '@/components/Icons'
import styles from './detail.module.css'

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft', submitted: 'Submitted', under_review: 'Under Review',
  more_info_required: 'More Information Required', shortlisted: 'Shortlisted',
  interview_scheduled: 'Interview Scheduled', assessment_scheduled: 'Assessment Scheduled',
  accepted: 'Accepted', rejected: 'Not Successful', withdrawn: 'Withdrawn', expired: 'Expired',
}

interface Props {
  application: any
  events: { id: string; status: string; note: string | null; created_at: string }[]
  messages: { id: string; body: string; sender_is_school: boolean; created_at: string }[]
  userId: string
}

export default function ApplicationDetailClient({ application: app, events, messages: initMessages, userId }: Props) {
  const [messages, setMessages] = useState(initMessages)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const supabase = createClient()
  const sc = app.schools?.primary_color ?? '#800020'

  async function sendMessage() {
    if (!draft.trim() || sending) return
    setSending(true)
    const { data, error } = await supabase.from('admission_messages').insert({
      application_id: app.id,
      sender_profile_id: userId,
      sender_is_school: false,
      body: draft.trim(),
    }).select().single()
    if (!error && data) {
      setMessages(m => [...m, data])
      setDraft('')
    }
    setSending(false)
  }

  return (
    <div className={styles.page}>
      <Link href="/dashboard/applications" className={styles.back}>
        <ArrowLeftIcon size={16} color="var(--text-muted)" /> All Applications
      </Link>

      <div className={styles.headerCard} style={{ borderColor: sc + '44' }}>
        <div className={styles.headerIcon} style={{ background: sc + '22' }}>
          <SchoolIcon size={20} color={sc} />
        </div>
        <div>
          <h1 className={styles.schoolName}>{app.schools?.name}</h1>
          <p className={styles.schoolLoc}>{[app.schools?.city, app.schools?.state].filter(Boolean).join(', ')}</p>
        </div>
        <span className={styles.statusPill} style={{ background: sc + '22', color: sc }}>
          {STATUS_LABEL[app.status] ?? app.status}
        </span>
      </div>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Application Details</h2>
        <div className={styles.detailGrid}>
          <div><span className={styles.detailLabel}>Applicant</span><p>{app.applicant_name}</p></div>
          <div><span className={styles.detailLabel}>Applying for</span><p>{app.class_applying_for || 'N/A'}</p></div>
          {app.interview_at && <div><span className={styles.detailLabel}>Interview</span><p>{new Date(app.interview_at).toLocaleString('en-NG')}</p></div>}
          {app.assessment_at && <div><span className={styles.detailLabel}>Assessment</span><p>{new Date(app.assessment_at).toLocaleString('en-NG')}</p></div>}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Timeline</h2>
        {events.length === 0 ? (
          <p className={styles.emptyHint}>No updates yet.</p>
        ) : (
          <div className={styles.timeline}>
            {events.map(ev => (
              <div key={ev.id} className={styles.timelineItem}>
                <div className={styles.timelineDot} style={{ background: sc }} />
                <div>
                  <p className={styles.timelineStatus}>{STATUS_LABEL[ev.status] ?? ev.status}</p>
                  {ev.note && <p className={styles.timelineNote}>{ev.note}</p>}
                  <p className={styles.timelineDate}>{new Date(ev.created_at).toLocaleString('en-NG')}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Messages</h2>
        <div className={styles.messages}>
          {messages.length === 0 && <p className={styles.emptyHint}>No messages yet. You can reach out to the school here.</p>}
          {messages.map(m => (
            <div key={m.id} className={m.sender_is_school ? styles.msgSchool : styles.msgMe}>
              <p className={styles.msgBody}>{m.body}</p>
              <p className={styles.msgDate}>{new Date(m.created_at).toLocaleString('en-NG', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
            </div>
          ))}
        </div>
        <div className={styles.msgInputRow}>
          <input
            className={styles.msgInput}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="Message the admission team…"
            onKeyDown={e => e.key === 'Enter' && sendMessage()}
            maxLength={2000}
          />
          <button className={styles.msgSendBtn} onClick={sendMessage} disabled={sending || !draft.trim()} style={{ background: sc }}>
            <SendIcon size={16} color="#fff" />
          </button>
        </div>
      </section>
    </div>
  )
}
