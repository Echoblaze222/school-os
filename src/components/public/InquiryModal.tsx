'use client'
// src/components/public/InquiryModal.tsx
// "Request information" form (see route.ts docblock for why this is
// intentionally lighter than a full Lane C application). Full
// IDLE -> PROCESSING -> SUCCESS/FAILURE flow per the UX motion spec:
// the button communicates its own state, errors preserve what the
// visitor typed, and a duplicate submit is impossible mid-flight.

import { useState } from 'react'
import { XIcon, CheckCircleIcon } from '@/components/Icons'
import ActionButton from '@/components/motion/ActionButton'
import motion from '@/components/dashboard-motion.module.css'
import styles from './InquiryModal.module.css'

interface Props {
  schoolSlug: string
  schoolName: string
  onClose: () => void
}

type Status = 'idle' | 'submitting' | 'success' | 'error'

export default function InquiryModal({ schoolSlug, schoolName, onClose }: Props) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail]       = useState('')
  const [phone, setPhone]       = useState('')
  const [message, setMessage]   = useState('')
  const [website, setWebsite]   = useState('') // honeypot, kept empty by real users
  const [status, setStatus]     = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const submit = async () => {
    if (status === 'submitting') return // duplicate-submit protection

    if (!fullName.trim() || !email.trim() || message.trim().length < 10) {
      setStatus('error')
      setErrorMsg('Please fill in your name, email, and a short message.')
      return
    }

    setStatus('submitting')
    setErrorMsg('')
    try {
      const res = await fetch(`/api/public/schools/${schoolSlug}/inquiries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, email, phone, message, website }),
      })
      const data = await res.json()

      if (!res.ok) {
        setStatus('error')
        setErrorMsg(data.error || 'Could not send your message. Please try again.')
        return // form data preserved, nothing cleared
      }

      setStatus('success')
    } catch {
      setStatus('error')
      setErrorMsg('Could not send your message. Check your connection and try again.')
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={`${styles.modal} glass-card ${motion.riseIn}`}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Request information from ${schoolName}`}
      >
        <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
          <XIcon size={18} />
        </button>

        {status === 'success' ? (
          <div className={styles.successState}>
            <div className={styles.successIcon}><CheckCircleIcon size={28} /></div>
            <h3 className="h3">Message sent</h3>
            <p className="body">{schoolName} will reach out to the email address you provided.</p>
            <button type="button" className="btn btn-primary" onClick={onClose} style={{ marginTop: 'var(--space-2)' }}>
              Done
            </button>
          </div>
        ) : (
          <>
            <h3 className="h3">Ask {schoolName} a question</h3>
            <p className={styles.subtitle}>
              Send a short message. This goes directly to the school, not a general application.
            </p>

            <div className={styles.form}>
              <div className="input-group">
                <label className="input-label" htmlFor="inq-name">Your name</label>
                <input
                  id="inq-name"
                  className="input"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  maxLength={120}
                  disabled={status === 'submitting'}
                />
              </div>
              <div className="input-group">
                <label className="input-label" htmlFor="inq-email">Email</label>
                <input
                  id="inq-email"
                  type="email"
                  className="input"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  maxLength={200}
                  disabled={status === 'submitting'}
                />
              </div>
              <div className="input-group">
                <label className="input-label" htmlFor="inq-phone">Phone (optional)</label>
                <input
                  id="inq-phone"
                  className="input"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  maxLength={30}
                  disabled={status === 'submitting'}
                />
              </div>
              <div className="input-group">
                <label className="input-label" htmlFor="inq-message">Message</label>
                <textarea
                  id="inq-message"
                  className="input"
                  rows={4}
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  maxLength={2000}
                  placeholder="e.g. What are your admission requirements for JSS1?"
                  disabled={status === 'submitting'}
                />
              </div>

              {/* Honeypot: hidden from real visitors via CSS, invisible to
                  screen readers via aria-hidden + tabIndex, but present in
                  the DOM for basic bots that fill every field. */}
              <div className={styles.honeypot} aria-hidden="true">
                <input
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={website}
                  onChange={e => setWebsite(e.target.value)}
                />
              </div>

              {status === 'error' && (
                <p className={styles.errorText}>{errorMsg}</p>
              )}

              <ActionButton
                onClick={submit}
                loading={status === 'submitting'}
                loadingLabel="Sending..."
                color="var(--brand)"
                fullWidth
              >
                Send message
              </ActionButton>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
