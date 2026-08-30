'use client'
// src/app/verify/certificate/[token]/VerifyClient.tsx
// Deliberately plain: this page exists to be trusted, not to impress.
// No gradients, no decorative motion — a clear status and the minimal
// facts §31 allows, nothing else.

import { CheckCircleIcon, XIcon, AlertCircleIcon } from '@/components/Icons'

interface VerifyData {
  ok: boolean
  status: 'valid' | 'revoked' | 'not_found' | 'error'
  certificate?: {
    certificateNumber: string
    schoolName: string | null
    studentName: string | null
    finalClass: string | null
    graduationYear: number
    issueDate: string | null
    revokedAt: string | null
  }
  error?: string
}

export default function VerifyClient({ data }: { data: VerifyData }) {
  const status = data.status ?? 'error'

  const config = {
    valid:     { icon: CheckCircleIcon, color: '#10B981', bg: 'rgba(16,185,129,0.1)', label: 'Valid Certificate' },
    revoked:   { icon: XIcon,           color: '#EF4444', bg: 'rgba(239,68,68,0.1)',  label: 'Certificate Revoked' },
    not_found: { icon: AlertCircleIcon, color: '#6B7280', bg: 'rgba(107,114,128,0.1)', label: 'Certificate Not Found' },
    error:     { icon: AlertCircleIcon, color: '#6B7280', bg: 'rgba(107,114,128,0.1)', label: 'Verification Unavailable' },
  }[status]

  const Icon = config.icon

  return (
    <div style={{ minHeight: '100dvh', background: '#F4F6FB', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 440, background: '#fff', borderRadius: 16, border: '1px solid #E5E7EB', padding: '36px 28px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, marginBottom: 24 }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: config.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon size={30} color={config.color} />
          </div>
          <h1 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#111827', textAlign: 'center' }}>{config.label}</h1>
        </div>

        {status === 'valid' && data.certificate && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Row label="Certificate No." value={data.certificate.certificateNumber} />
            <Row label="Student" value={data.certificate.studentName ?? '—'} />
            <Row label="School" value={data.certificate.schoolName ?? '—'} />
            <Row label="Class" value={data.certificate.finalClass ?? '—'} />
            <Row label="Graduation Year" value={String(data.certificate.graduationYear)} />
            <Row label="Issue Date" value={data.certificate.issueDate ? new Date(data.certificate.issueDate).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'} />
          </div>
        )}

        {status === 'revoked' && data.certificate && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ fontSize: '0.85rem', color: '#6B7280', textAlign: 'center', margin: '0 0 8px' }}>
              This certificate was issued but has since been revoked and is no longer valid.
            </p>
            <Row label="Certificate No." value={data.certificate.certificateNumber} />
            <Row label="Student" value={data.certificate.studentName ?? '—'} />
            <Row label="School" value={data.certificate.schoolName ?? '—'} />
            {data.certificate.revokedAt && <Row label="Revoked On" value={new Date(data.certificate.revokedAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })} />}
          </div>
        )}

        {status === 'not_found' && (
          <p style={{ fontSize: '0.85rem', color: '#6B7280', textAlign: 'center', margin: 0 }}>
            We couldn't find a certificate matching this link. Double-check the QR code or link, or contact the issuing school directly.
          </p>
        )}

        {status === 'error' && (
          <p style={{ fontSize: '0.85rem', color: '#6B7280', textAlign: 'center', margin: 0 }}>
            {data.error || "We couldn't complete verification right now. Try again in a moment."}
          </p>
        )}

        <p style={{ fontSize: '0.7rem', color: '#9CA3AF', textAlign: 'center', marginTop: 28, marginBottom: 0 }}>
          Verified against the issuing school's official records.
        </p>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, paddingBottom: 10, borderBottom: '1px solid #F3F4F6', fontSize: '0.85rem' }}>
      <span style={{ color: '#9CA3AF' }}>{label}</span>
      <span style={{ color: '#111827', fontWeight: 600, textAlign: 'right' as const }}>{value}</span>
    </div>
  )
}
