'use client'
import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import DashboardHeader from '@/components/DashboardHeader'
import StudentNav from '@/components/StudentNav'
import { UserIcon, EditIcon, CameraIcon, LogOutIcon, ShieldIcon, KeyIcon } from '@/components/Icons'
import { useRouter } from 'next/navigation'
import styles from './page.module.css'

interface Props { profile: any; school: any; userId: string }

export default function ProfileClient({ profile, school, userId }: Props) {
  const [editing,   setEditing]   = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [fullName,  setFullName]  = useState(profile?.full_name ?? '')
  const [phone,     setPhone]     = useState(profile?.phone ?? '')
  const [uploading, setUploading] = useState(false)
  const [avatar,    setAvatar]    = useState(profile?.avatar_url ?? '')
  const [msg,       setMsg]       = useState('')
  const fileRef  = useRef<HTMLInputElement>(null)
  const supabase = createClient()
  const router   = useRouter()
  const schoolColor = school?.primary_color ?? '#7C3AED'

  async function saveProfile() {
    setSaving(true); setMsg('')
    const { error } = await supabase.from('profiles')
      .update({ full_name: fullName, phone, updated_at: new Date().toISOString() })
      .eq('id', userId)
    if (error) setMsg('Failed to save. Try again.')
    else { setMsg('Profile updated!'); setEditing(false) }
    setSaving(false)
  }

  async function uploadAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const ext  = file.name.split('.').pop()
    const path = `avatars/${userId}.${ext}`
    const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (!error) {
      const { data: url } = supabase.storage.from('avatars').getPublicUrl(path)
      await supabase.from('profiles').update({ avatar_url: url.publicUrl }).eq('id', userId)
      setAvatar(url.publicUrl)
    }
    setUploading(false)
  }

  async function logout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const fields = [
    { label: 'Full Name',    value: profile?.full_name    ?? '—' },
    { label: 'Student Code', value: profile?.default_code ?? '—' },
    { label: 'Class Level',  value: profile?.class_level  ?? '—' },
    { label: 'School',       value: school?.name          ?? '—' },
    { label: 'Email',        value: profile?.email        ?? '—' },
    { label: 'Phone',        value: profile?.phone        ?? '—' },
  ]

  return (
    <div className={styles.page}>
      <StudentNav userId={userId} profile={profile} school={school} schoolColor={schoolColor} />
      <div className={styles.content}>
        <DashboardHeader userId={userId} role="student" profile={profile} school={school}
          schoolColor={schoolColor} title="My Profile" showBack />
        <main className={styles.main}>
          {/* Avatar */}
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'var(--space-4)', marginBottom:'var(--space-7)' }}>
            <div style={{ position:'relative' }}>
              <div style={{ width:90, height:90, borderRadius:'50%', background:schoolColor, display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', border:`3px solid ${schoolColor}40` }}>
                {avatar
                  ? <img src={avatar} alt={fullName} style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
                  : <UserIcon size={36} color="white"/>
                }
              </div>
              <button onClick={() => fileRef.current?.click()}
                style={{ position:'absolute', bottom:0, right:0, width:30, height:30, borderRadius:'50%', background:schoolColor, border:'2px solid var(--bg-base)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
                {uploading ? '...' : <CameraIcon size={14} color="white"/>}
              </button>
              <input ref={fileRef} type="file" accept="image/*" style={{ display:'none' }} onChange={uploadAvatar}/>
            </div>
            <div style={{ textAlign:'center' }}>
              <p style={{ fontSize:'1.1rem', fontWeight:800, color:'var(--text-primary)', margin:'0 0 2px' }}>{profile?.full_name}</p>
              <p style={{ fontSize:'0.75rem', color:'var(--text-muted)', margin:0, textTransform:'capitalize' }}>
                {profile?.role} · {profile?.class_level}
              </p>
            </div>
          </div>

          {/* Info card */}
          <div style={{ background:'var(--glass-bg)', border:'1px solid var(--glass-border)', borderRadius:'var(--radius-xl)', overflow:'hidden', marginBottom:'var(--space-5)' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'var(--space-4) var(--space-5)', borderBottom:'1px solid var(--glass-border)' }}>
              <p style={{ fontSize:'0.72rem', fontWeight:800, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--text-muted)', margin:0 }}>Personal Info</p>
              <button onClick={() => setEditing(!editing)}
                style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 12px', background:editing?'var(--glass-bg)':'var(--brand-subtle)', border:`1px solid ${editing?'var(--glass-border)':'var(--brand-border)'}`, borderRadius:'999px', color:editing?'var(--text-muted)':'var(--brand-light)', fontSize:'0.72rem', fontWeight:700, cursor:'pointer' }}>
                <EditIcon size={12}/> {editing ? 'Cancel' : 'Edit'}
              </button>
            </div>

            {editing ? (
              <div style={{ padding:'var(--space-5)', display:'flex', flexDirection:'column', gap:'var(--space-4)' }}>
                <div>
                  <label style={{ fontSize:'0.75rem', fontWeight:600, color:'var(--text-secondary)', display:'block', marginBottom:6 }}>Full Name</label>
                  <input value={fullName} onChange={e => setFullName(e.target.value)}
                    style={{ width:'100%', height:44, padding:'0 14px', background:'var(--input-bg)', border:'1px solid var(--input-border)', borderRadius:'var(--radius-md)', color:'var(--text-primary)', fontSize:'0.875rem', outline:'none' }}/>
                </div>
                <div>
                  <label style={{ fontSize:'0.75rem', fontWeight:600, color:'var(--text-secondary)', display:'block', marginBottom:6 }}>Phone Number</label>
                  <input value={phone} onChange={e => setPhone(e.target.value)}
                    style={{ width:'100%', height:44, padding:'0 14px', background:'var(--input-bg)', border:'1px solid var(--input-border)', borderRadius:'var(--radius-md)', color:'var(--text-primary)', fontSize:'0.875rem', outline:'none' }}/>
                </div>
                {msg && <p style={{ fontSize:'0.78rem', color: msg.includes('!') ? '#10B981' : '#EF4444', margin:0 }}>{msg}</p>}
                <button onClick={saveProfile} disabled={saving}
                  style={{ width:'100%', height:44, background:`linear-gradient(135deg,${schoolColor},${schoolColor}cc)`, color:'#fff', border:'none', borderRadius:'var(--radius-md)', fontWeight:700, fontSize:'0.875rem', cursor:'pointer' }}>
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            ) : (
              <div>
                {fields.map(f => (
                  <div key={f.label} style={{ display:'flex', justifyContent:'space-between', padding:'var(--space-3) var(--space-5)', borderBottom:'1px solid var(--glass-border)', fontSize:'0.85rem' }}>
                    <span style={{ color:'var(--text-muted)' }}>{f.label}</span>
                    <span style={{ fontWeight:600, color:'var(--text-primary)' }}>{f.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div style={{ display:'flex', flexDirection:'column', gap:'var(--space-2)' }}>
            <a href="/forgot-password"
              style={{ display:'flex', alignItems:'center', gap:'var(--space-3)', padding:'var(--space-4)', background:'var(--glass-bg)', border:'1px solid var(--glass-border)', borderRadius:'var(--radius-lg)', color:'var(--text-secondary)', fontSize:'0.85rem', fontWeight:500, textDecoration:'none' }}>
              <KeyIcon size={16}/> Change Password
            </a>
            <button onClick={logout}
              style={{ display:'flex', alignItems:'center', gap:'var(--space-3)', padding:'var(--space-4)', background:'var(--danger-subtle)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:'var(--radius-lg)', color:'var(--danger)', fontSize:'0.85rem', fontWeight:600, cursor:'pointer', width:'100%', textAlign:'left' }}>
              <LogOutIcon size={16} color="var(--danger)"/> Sign Out
            </button>
          </div>
          <div className={styles.spacer}/>
        </main>
      </div>
    </div>
  )
}
