'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { SaveIcon } from '@/components/Icons'
import styles from '@/app/dashboard/student/records/page.module.css'

interface Props { profile: any; school: any; userId: string }

export default function BursarSettingsClient({ profile, school, userId }: Props) {
  const [form,   setForm]   = useState({
    full_name: profile?.full_name ?? '',
    phone:     profile?.phone     ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)
  const supabase = createClient()
  const sc       = school?.primary_color ?? '#7C3AED'

  async function save() {
    setSaving(true); setSaved(false)
    await supabase.from('profiles').update(form).eq('id', userId)
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const inp: React.CSSProperties = { width:'100%', height:44, padding:'0 14px',
    background:'var(--input-bg)', border:'1px solid var(--input-border)',
    borderRadius:10, color:'var(--text-primary)', fontSize:'0.85rem', outline:'none' }
  const lbl: React.CSSProperties = { fontSize:'0.72rem', fontWeight:700,
    color:'var(--text-muted)', letterSpacing:'0.05em', marginBottom:6, display:'block' }

  return (
    <RolePageWrapper userId={userId} role="bursar" profile={profile} school={school} title="Settings">
      {/* School info — read only */}
      <div style={{ padding:'var(--space-5)', background:'var(--glass-bg)',
        border:'1px solid var(--glass-border)', borderRadius:'var(--radius-xl)',
        marginBottom:'var(--space-6)' }}>
        <p style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--text-muted)',
          letterSpacing:'0.05em', margin:'0 0 var(--space-3)' }}>SCHOOL</p>
        <p style={{ fontSize:'0.95rem', fontWeight:800, color:'var(--text-primary)',
          margin:'0 0 2px' }}>{school?.name}</p>
        {school?.address && (
          <p style={{ fontSize:'0.78rem', color:'var(--text-muted)', margin:'0 0 var(--space-4)' }}>
            {school.address}
          </p>
        )}
        {school?.bank_name && (
          <>
            <p style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--text-muted)',
              letterSpacing:'0.05em', margin:'0 0 4px' }}>BANK ACCOUNT</p>
            <p style={{ fontSize:'0.85rem', fontWeight:700, color:'var(--text-primary)',
              margin:'0 0 2px' }}>{school.account_name}</p>
            <p style={{ fontSize:'0.78rem', color:'var(--text-muted)', margin:0 }}>
              {school.bank_name} · {school.account_number}
            </p>
          </>
        )}
      </div>

      {/* Editable profile */}
      <div style={{ display:'grid', gap:'var(--space-4)' }}>
        <div>
          <label style={lbl}>FULL NAME</label>
          <input value={form.full_name}
            onChange={e => setForm(p => ({...p, full_name:e.target.value}))} style={inp}/>
        </div>
        <div>
          <label style={lbl}>PHONE</label>
          <input value={form.phone} placeholder="Phone number"
            onChange={e => setForm(p => ({...p, phone:e.target.value}))} style={inp}/>
        </div>
        <div>
          <label style={lbl}>EMAIL</label>
          <input value={profile?.email ?? ''} disabled
            style={{ ...inp, opacity:0.5, cursor:'not-allowed' }}/>
        </div>
        <div>
          <label style={lbl}>ROLE</label>
          <input value="Bursar" disabled
            style={{ ...inp, opacity:0.5, cursor:'not-allowed' }}/>
        </div>
      </div>

      <button onClick={save} disabled={saving}
        style={{ width:'100%', height:48, background:saved ? '#10B981' : sc,
          color:'#fff', border:'none', borderRadius:10, fontWeight:700, fontSize:'0.9rem',
          cursor:'pointer', marginTop:'var(--space-6)',
          display:'flex', alignItems:'center', justifyContent:'center', gap:8,
          opacity:saving ? 0.7 : 1, transition:'background 0.2s' }}>
        <SaveIcon size={16} color="#fff"/>
        {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save Changes'}
      </button>
      <div className={styles.spacer}/>
    </RolePageWrapper>
  )
}
