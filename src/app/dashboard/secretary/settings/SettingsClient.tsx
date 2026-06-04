'use client'
// src/app/dashboard/secretary/settings/SettingsClient.tsx

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import styles from '../secretary.module.css'

interface Props { profile: any; school: any; userId: string }

const SECTIONS = [
  { id: 'profile',    label: 'Personal Info',       emoji: '👤' },
  { id: 'school',     label: 'School Settings',     emoji: '🏫' },
  { id: 'notifs',     label: 'Notifications',       emoji: '🔔' },
  { id: 'security',   label: 'Security',            emoji: '🔐' },
  { id: 'appearance', label: 'Appearance',          emoji: '🎨' },
]

export default function SettingsClient({ profile, school, userId }: Props) {
  const [section,  setSection]  = useState('profile')
  const [saving,   setSaving]   = useState(false)
  const [msg,      setMsg]      = useState('')

  // Profile form
  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [phone,    setPhone]    = useState(profile?.phone ?? '')

  // Notification prefs (stored locally for demo; could be a DB table)
  const [notifs, setNotifs] = useState({
    newStudents: true, admissions: true, notices: false, system: true,
  })

  // Theme
  const [theme, setTheme] = useState<'dark' | 'light'>(
    typeof window !== 'undefined' ? (localStorage.getItem('schoolos_theme') as any ?? 'dark') : 'dark'
  )

  const supabase = createClient()
  const router   = useRouter()
  const sc       = school?.primary_color ?? '#7C3AED'

  async function saveProfile() {
    setSaving(true); setMsg('')
    const { error } = await supabase.from('profiles').update({ full_name: fullName, phone }).eq('id', userId)
    setMsg(error ? error.message : 'Profile updated!')
    setSaving(false)
  }

  async function logout() {
    await supabase.auth.signOut()
    router.push('/login'); router.refresh()
  }

  function toggleTheme(t: 'dark' | 'light') {
    setTheme(t)
    document.documentElement.setAttribute('data-theme', t === 'light' ? 'light' : '')
    localStorage.setItem('schoolos_theme', t)
  }

  return (
    <RolePageWrapper userId={userId} role="secretary" profile={profile} school={school} title="Settings">
      {/* Nav tabs */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginBottom: 'var(--space-6)' }}>
        {SECTIONS.map(s => (
          <button key={s.id} onClick={() => { setSection(s.id); setMsg('') }}
            style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-4) var(--space-5)', background: section === s.id ? sc + '18' : 'var(--glass-bg)', border: `1px solid ${section === s.id ? sc + '50' : 'var(--glass-border)'}`, borderRadius: 'var(--radius-lg)', cursor: 'pointer', transition: 'all 0.15s ease', textAlign: 'left', color: section === s.id ? sc : 'var(--text-secondary)', fontWeight: 600, fontSize: '0.875rem' }}>
            <span style={{ fontSize: '1.1rem' }}>{s.emoji}</span>
            <span>{s.label}</span>
            <svg style={{ marginLeft: 'auto', opacity: 0.5 }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        ))}
      </div>

      {/* Content */}
      {section === 'profile' && (
        <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-5)' }}>
          <p style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 'var(--space-5)' }}>Personal Info</p>
          {[['Full Name', fullName, setFullName, 'text', 'Your full name'],
            ['Phone',     phone,    setPhone,    'tel',  '+234 000 000 0000'],
          ].map(([label, val, setter, type, placeholder]: any) => (
            <div key={label} className={styles.formGroup}>
              <label className={styles.formLabel}>{label}</label>
              <input className={styles.formInput} type={type} value={val} onChange={e => setter(e.target.value)} placeholder={placeholder} />
            </div>
          ))}
          {[['ID Code', profile?.default_code ?? '—'], ['Role', 'Secretary'], ['Email', profile?.email ?? '—'], ['School', school?.name ?? '—']].map(([l, v]) => (
            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-3) 0', borderTop: '1px solid var(--glass-border)', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>{l}</span>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{v}</span>
            </div>
          ))}
          {msg && <p style={{ fontSize: '0.78rem', color: msg.includes('!') ? '#10B981' : '#EF4444', margin: 'var(--space-3) 0 0' }}>{msg}</p>}
          <button className={styles.btnPrimary} onClick={saveProfile} disabled={saving} style={{ width: '100%', marginTop: 'var(--space-5)' }}>{saving ? 'Saving…' : 'Save Changes'}</button>
        </div>
      )}

      {section === 'school' && (
        <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-5)' }}>
          <p style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 'var(--space-4)' }}>School Information</p>
          {[['School Name', school?.name ?? '—'], ['School ID', school?.id ?? '—'], ['Address', school?.address ?? '—'], ['Phone', school?.phone ?? '—'], ['Email', school?.email ?? '—']].map(([l, v]) => (
            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-3) 0', borderBottom: '1px solid var(--glass-border)', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>{l}</span>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)', textAlign: 'right', maxWidth: '60%' }}>{v}</span>
            </div>
          ))}
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 'var(--space-4)' }}>Contact your administrator to update school details.</p>
        </div>
      )}

      {section === 'notifs' && (
        <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
          <p style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', padding: 'var(--space-4) var(--space-5)' }}>Notification Preferences</p>
          {([
            ['newStudents', 'New Student Registrations', 'Alert when a new student is added'],
            ['admissions',  'Admission Updates',          'Alerts on new or changed applications'],
            ['notices',     'School Notices',             'Get notified when notices are posted'],
            ['system',      'System Alerts',              'Important system and security alerts'],
          ] as [keyof typeof notifs, string, string][]).map(([key, label, desc]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', padding: 'var(--space-4) var(--space-5)', borderBottom: '1px solid var(--glass-border)', gap: 'var(--space-4)' }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 2px' }}>{label}</p>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: 0 }}>{desc}</p>
              </div>
              <button onClick={() => setNotifs(p => ({ ...p, [key]: !p[key] }))}
                style={{ width: 44, height: 24, borderRadius: 12, background: notifs[key] ? sc : 'var(--glass-border)', border: 'none', cursor: 'pointer', transition: 'background 0.2s', position: 'relative', flexShrink: 0 }}>
                <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: notifs[key] ? 23 : 3, transition: 'left 0.2s' }} />
              </button>
            </div>
          ))}
        </div>
      )}

      {section === 'security' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <a href="/forgot-password" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-4)', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg)', color: 'var(--text-secondary)', fontSize: '0.875rem', fontWeight: 500, textDecoration: 'none' }}>
            🔑 Change Password
          </a>
          <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4) var(--space-5)' }}>
            <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>Login Code</p>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '0 0 var(--space-3)' }}>Your unique access code for this school</p>
            <p style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'monospace', letterSpacing: '0.08em' }}>{profile?.default_code ?? '—'}</p>
          </div>
          <button onClick={logout} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-4)', background: 'var(--danger-subtle)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius-lg)', color: 'var(--danger)', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', width: '100%', textAlign: 'left' }}>
            🚪 Sign Out
          </button>
        </div>
      )}

      {section === 'appearance' && (
        <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-5)' }}>
          <p style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 'var(--space-5)' }}>Theme</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
            {[['dark', '🌙', 'Dark Mode'], ['light', '☀️', 'Light Mode']].map(([t, emoji, label]) => (
              <button key={t} onClick={() => toggleTheme(t as any)}
                style={{ padding: 'var(--space-5)', background: theme === t ? sc + '18' : 'var(--glass-bg)', border: `2px solid ${theme === t ? sc : 'var(--glass-border)'}`, borderRadius: 'var(--radius-xl)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)' }}>
                <span style={{ fontSize: '2rem' }}>{emoji}</span>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: theme === t ? sc : 'var(--text-secondary)' }}>{label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ height: 110 }} />
    </RolePageWrapper>
  )
}
