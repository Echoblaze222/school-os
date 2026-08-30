'use client'
// src/app/dashboard/student/certificates/StudentCertificatesClient.tsx
//
// Most students will have zero or one certificate (issued once at
// graduation) — designed for that common case first, with a real empty
// state rather than an empty table, and a revoked certificate shown
// plainly rather than hidden, per the same honesty principle the public
// verification page uses.

import { useEffect, useState } from 'react'
import RolePageWrapper from '@/components/RolePageWrapper'
import {
  GraduationCapIcon, DownloadIcon, CopyIcon, CheckCircleIcon, XIcon, AlertIcon,
} from '@/components/Icons'
import motion from '@/components/dashboard-motion.module.css'

interface Certificate {
  id: string; certificateNumber: string; status: 'issued' | 'revoked'
  graduationYear: number; finalClass: string | null; issueDate: string | null
  pdfUrl: string | null; revokedAt: string | null; revokedReason: string | null
  schoolName: string | null; verificationUrl: string
}

interface Props { userId: string; profile: any; school: any }

export default function StudentCertificatesClient({ userId, profile, school }: Props) {
  const sc = school?.primary_color ?? '#7C3AED'
  const [certs, setCerts]   = useState<Certificate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/student/certificates')
      const data = await res.json()
      if (!data.ok) { setError(data.error); setLoading(false); return }
      setCerts(data.certificates)
    } catch {
      setError("Couldn't load your certificate right now. Try again in a moment.")
    }
    setLoading(false)
  }

  async function copyLink(cert: Certificate) {
    try {
      await navigator.clipboard.writeText(cert.verificationUrl)
      setCopiedId(cert.id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch { /* clipboard blocked — link is still visible/selectable in the UI */ }
  }

  return (
    <RolePageWrapper userId={userId} role="student" profile={profile} school={school} title="My Certificate">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>

        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'var(--danger-subtle)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, fontSize: '0.82rem', color: 'var(--danger)' }}>
            <AlertIcon size={14} /><span style={{ flex: 1 }}>{error}</span>
          </div>
        )}

        {loading && (
          <div className="glass-card" style={{ padding: 'var(--space-6)', justifyContent: 'center' }}>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Loading...</p>
          </div>
        )}

        {!loading && !error && certs.length === 0 && (
          <div className={`glass-card ${motion.riseIn}`} style={{ flexDirection: 'column', alignItems: 'center', textAlign: 'center' as const, padding: 'var(--space-8) var(--space-5)', gap: 12 }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--glass-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <GraduationCapIcon size={28} color="var(--text-faint)" strokeWidth={1.5} />
            </div>
            <p style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.95rem', margin: 0 }}>No certificate yet</p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', maxWidth: 300, margin: 0 }}>
              Your graduation certificate will appear here once your school issues it.
            </p>
          </div>
        )}

        {!loading && certs.map(cert => (
          <div key={cert.id} className={`glass-card ${motion.riseIn}`} style={{ flexDirection: 'column', padding: 'var(--space-5)', gap: 14 }}>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              <div style={{
                width: 52, height: 52, borderRadius: 14, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: cert.status === 'issued' ? `${sc}18` : 'var(--danger-subtle)',
              }}>
                <GraduationCapIcon size={24} color={cert.status === 'issued' ? sc : 'var(--danger)'} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)' }}>
                  Certificate of Graduation
                </p>
                <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {cert.schoolName ?? 'Your school'} · Class of {cert.graduationYear}{cert.finalClass ? ` · ${cert.finalClass}` : ''}
                </p>
              </div>
              {cert.status === 'issued'
                ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.7rem', fontWeight: 700, padding: '4px 10px', borderRadius: 999, background: 'var(--success-subtle)', color: 'var(--success)' }}>
                    <CheckCircleIcon size={12} /> Valid
                  </span>
                : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.7rem', fontWeight: 700, padding: '4px 10px', borderRadius: 999, background: 'var(--danger-subtle)', color: 'var(--danger)' }}>
                    <XIcon size={12} /> Revoked
                  </span>
              }
            </div>

            {cert.status === 'revoked' && (
              <div style={{ padding: '10px 14px', background: 'var(--danger-subtle)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, fontSize: '0.78rem', color: 'var(--danger)' }}>
                This certificate was revoked{cert.revokedAt ? ` on ${new Date(cert.revokedAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}
                {cert.revokedReason ? `: ${cert.revokedReason}` : '.'} Contact your school if you believe this is a mistake.
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 10, fontSize: '0.78rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Certificate No.</span>
              <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{cert.certificateNumber}</span>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' as const }}>
              {cert.status === 'issued' && cert.pdfUrl && (
                <a href={cert.pdfUrl} target="_blank" rel="noopener noreferrer" className={motion.pressable}
                  style={{ flex: 1, minWidth: 140, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 42, borderRadius: 10, background: sc, color: '#fff', fontWeight: 700, fontSize: '0.82rem', textDecoration: 'none' }}>
                  <DownloadIcon size={14} /> Download PDF
                </a>
              )}
              <button onClick={() => copyLink(cert)} className={motion.pressable}
                style={{ flex: 1, minWidth: 140, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 42, borderRadius: 10, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>
                {copiedId === cert.id ? <><CheckCircleIcon size={14} color="var(--success)" /> Copied</> : <><CopyIcon size={14} /> Copy Verification Link</>}
              </button>
            </div>

            <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-faint)' }}>
              Anyone with this link — an employer, another school — can verify this certificate is genuine without needing an account.
            </p>
          </div>
        ))}
      </div>
    </RolePageWrapper>
  )
}
