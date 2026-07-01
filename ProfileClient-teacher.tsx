'use client'
// src/app/dashboard/teacher/profile/ProfileClient.tsx
// FIX #12: Added teacher-specific fields — subjects, classes, qualification, employee ID, years experience

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import {
  UserIcon, CameraIcon, KeyIcon, LogOutIcon, EditIcon,
} from '@/components/Icons'

interface Props {
  profile: any
  school:  any
  userId:  string
}

interface TeacherClass {
  class_id:   string
  class_name: string
  subject:    string | null
  is_primary: boolean
}

export default function ProfileClient({ profile, school, userId }: Props) {
  const [editing,     setEditing]     = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [fullName,    setFullName]    = useState(profile?.full_name    ?? '')
  const [phone,       setPhone]       = useState(profile?.phone        ?? '')
  const [avatar,      setAvatar]      = useState(profile?.avatar_url   ?? '')
  const [qualification, setQualification] = useState(profile?.qualification ?? '')
  const [employeeId,  setEmployeeId]  = useState(profile?.employee_id  ?? '')
  const [yearsExp,    setYearsExp]    = useState(profile?.years_experience ?? '')
  const [msg,         setMsg]         = useState('')
  const [myClasses,   setMyClasses]   = useState<TeacherClass[]>([])
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

  const fileRef  = useRef<HTMLInputElement>(null)
  const router   = useRouter()
  const supabase = createClient()
  const sc       = school?.primary_color ?? '#7C3AED'

  useEffect(() => { loadMyClasses() }, [])

  async function loadMyClasses() {
    const { data } = await supabase
      .from('class_teachers')
      .select('class_id, subject, is_primary, classes(name)')
      .eq('teacher_id', userId)
      .eq('school_id', school?.id)
    if (data) {
      setMyClasses(data.map((ct: any) => ({
        class_id:   ct.class_id,
        class_name: ct.classes?.name ?? '',
        subject:    ct.subject,
        is_primary: ct.is_primary,
      })))
    }
  }

  async function save() {
    setSaving(true)
    setMsg('')
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name:        fullName,
        phone,
        qualification:    qualification || null,
        employee_id:      employeeId || null,
        years_experience: yearsExp ? Number(yearsExp) : null,
        updated_at:       new Date().toISOString(),
      })
      .eq('id', userId)

    if (error) {
      setMsg('Failed to save.')
    } else {
      setMsg('Profile updated!')
      setEditing(false)
    }
    setSaving(false)
  }

  async function uploadAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // Reset the input immediately so selecting the same file again
    // (e.g. after a failed attempt) still fires onChange.
    if (fileRef.current) fileRef.current.value = ''

    if (!file.type.startsWith('image/')) {
      setMsg('Please choose an image file.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setMsg('Image must be under 5 MB.')
      return
    }

    setUploadingPhoto(true)
    setMsg('Uploading photo…')

    try {
      const ext  = file.name.split('.').pop()
      // No leading 'avatars/' here — that prefix is the bucket name itself,
      // adding it again created a nested avatars/avatars/ path inside the bucket.
      const path = `${userId}_${Date.now()}.${ext}`

      const { error: uploadErr } = await supabase
        .storage
        .from('avatars')
        .upload(path, file, { upsert: true })

      if (uploadErr) {
        setMsg('Upload failed: ' + uploadErr.message)
        return
      }

      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      const freshUrl = data.publicUrl + '?t=' + Date.now()

      const { error: dbErr } = await supabase
        .from('profiles')
        .update({ avatar_url: data.publicUrl })
        .eq('id', userId)

      if (dbErr) {
        setMsg('Photo uploaded but saving to profile failed: ' + dbErr.message)
        return
      }

      setAvatar(freshUrl)
      setMsg('Photo updated!')
      router.refresh() // re-fetches server data so header/nav avatar also updates
    } catch (err: any) {
      // Catches network failures, CORS errors, or a missing bucket — all of
      // which previously failed silently with no feedback at all.
      console.error('Avatar upload error:', err)
      setMsg('Upload failed: ' + (err?.message ?? 'Please check your connection and try again.'))
    } finally {
      setUploadingPhoto(false)
    }
  }

  async function logout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  // Determine role type from class assignments
  const hasPrimaryClass  = myClasses.some(c => c.is_primary)
  const hasSubjectClasses = myClasses.some(c => !c.is_primary || c.subject)
  const roleLabel =
    hasPrimaryClass && hasSubjectClasses ? 'Class Teacher + Subject Teacher' :
    hasPrimaryClass                       ? 'Class Teacher' :
    hasSubjectClasses                     ? 'Subject Teacher' : 'Teacher'

  // Unique subjects taught
  const subjectsTaught = [...new Set(myClasses.filter(c => c.subject).map(c => c.subject!))]

  return (
    <RolePageWrapper userId={userId} role="teacher" profile={profile} school={school} title="My Profile">

      {/* Avatar + name block */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
        <div style={{ position: 'relative' }}>
          <div style={{
            width: 84, height: 84, borderRadius: '50%',
            background: sc,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden', border: `3px solid ${sc}40`,
          }}>
            {avatar
              ? <img src={avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: uploadingPhoto ? 0.4 : 1 }} />
              : <div style={{ opacity: uploadingPhoto ? 0.4 : 1, display: 'flex' }}><UserIcon size={32} color="white" /></div>
            }
            {uploadingPhoto && (
              <div style={{
                position: 'absolute', inset: 0, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{
                  width: 24, height: 24, borderRadius: '50%',
                  border: '3px solid rgba(255,255,255,0.3)',
                  borderTopColor: '#fff',
                  animation: 'profile-spin 0.8s linear infinite',
                }} />
              </div>
            )}
          </div>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploadingPhoto}
            style={{
              position: 'absolute', bottom: 0, right: 0,
              width: 28, height: 28, borderRadius: '50%',
              background: sc, border: '2px solid var(--bg-base)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: uploadingPhoto ? 'default' : 'pointer',
              opacity: uploadingPhoto ? 0.6 : 1,
            }}
          >
            <CameraIcon size={13} color="white" />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={uploadAvatar}
            disabled={uploadingPhoto}
          />
          <style>{`@keyframes profile-spin { to { transform: rotate(360deg); } }`}</style>
        </div>

        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 4px' }}>
            {profile?.full_name}
          </p>
          <span style={{
            padding: '4px 12px', borderRadius: 999,
            background: sc + '20', border: `1px solid ${sc}40`,
            color: sc, fontSize: '0.72rem', fontWeight: 700,
          }}>
            {roleLabel}
          </span>
        </div>
      </div>

      {/* ── Personal Info ── */}
      <div style={{
        background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
        borderRadius: 'var(--radius-xl)', overflow: 'hidden', marginBottom: 'var(--space-4)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: 'var(--space-4) var(--space-5)',
          borderBottom: '1px solid var(--glass-border)',
        }}>
          <p style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--text-muted)', margin: 0 }}>
            Personal Info
          </p>
          <button onClick={() => setEditing(!editing)} style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '5px 12px',
            background: editing ? 'var(--glass-bg)' : 'var(--brand-subtle)',
            border: `1px solid ${editing ? 'var(--glass-border)' : 'var(--brand-border)'}`,
            borderRadius: 999,
            color: editing ? 'var(--text-muted)' : 'var(--brand-light)',
            fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer',
          }}>
            <EditIcon size={11} />
            {editing ? 'Cancel' : 'Edit'}
          </button>
        </div>

        {editing ? (
          <div style={{ padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
              {[
                { label: 'Full Name',      value: fullName,       setter: setFullName,       type: 'text'   },
                { label: 'Phone',          value: phone,          setter: setPhone,          type: 'text'   },
                { label: 'Employee ID',    value: employeeId,     setter: setEmployeeId,     type: 'text'   },
                { label: 'Qualification',  value: qualification,  setter: setQualification,  type: 'text'   },
                { label: 'Years Teaching', value: String(yearsExp), setter: (v: string) => setYearsExp(v), type: 'number' },
              ].map(f => (
                <div key={f.label} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>{f.label}</label>
                  <input
                    type={f.type}
                    value={f.value}
                    onChange={e => f.setter(e.target.value)}
                    style={{ height: 40, padding: '0 12px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }}
                  />
                </div>
              ))}
            </div>

            {msg && (
              <p style={{ fontSize: '0.78rem', color: msg.includes('!') ? '#10B981' : '#EF4444', margin: 0 }}>
                {msg}
              </p>
            )}

            <button onClick={save} disabled={saving} style={{
              height: 44,
              background: `linear-gradient(135deg, ${sc}, ${sc}cc)`,
              color: '#fff', border: 'none', borderRadius: 10,
              fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer',
            }}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        ) : (
          <div>
            {[
              ['Full Name',      profile?.full_name       ?? '—'],
              ['Employee ID',    profile?.employee_id     ?? '—'],
              ['Email',          profile?.email           ?? '—'],
              ['Phone',          profile?.phone           ?? '—'],
              ['Qualification',  profile?.qualification   ?? '—'],
              ['Years Teaching', profile?.years_experience != null ? `${profile.years_experience} yrs` : '—'],
              ['ID Code',        profile?.default_code    ?? '—'],
              ['School',         school?.name             ?? '—'],
            ].map(([label, value]) => (
              <div key={label} style={{
                display: 'flex', justifyContent: 'space-between',
                padding: 'var(--space-3) var(--space-5)',
                borderBottom: '1px solid var(--glass-border)',
                fontSize: '0.85rem',
              }}>
                <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{value}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Teaching Assignments (read-only from class_teachers) ── */}
      <div style={{
        background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
        borderRadius: 'var(--radius-xl)', overflow: 'hidden', marginBottom: 'var(--space-4)',
      }}>
        <div style={{
          padding: 'var(--space-4) var(--space-5)',
          borderBottom: '1px solid var(--glass-border)',
        }}>
          <p style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--text-muted)', margin: '0 0 2px' }}>
            Teaching Assignments
          </p>
          <p style={{ fontSize: '0.7rem', color: 'var(--text-faint)', margin: 0 }}>
            Managed by your school admin
          </p>
        </div>

        {myClasses.length === 0 ? (
          <div style={{ padding: 'var(--space-5)', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
            No classes assigned yet.
          </div>
        ) : (
          <div>
            {myClasses.map((cls, i) => (
              <div key={`${cls.class_id}-${cls.subject ?? 'class'}`} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: 'var(--space-3) var(--space-5)',
                borderBottom: i < myClasses.length - 1 ? '1px solid var(--glass-border)' : 'none',
              }}>
                <div>
                  <p style={{ margin: '0 0 1px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {cls.class_name}
                  </p>
                  <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {cls.subject ?? 'All Subjects'}
                  </p>
                </div>
                <span style={{
                  padding: '3px 10px', borderRadius: 999,
                  background: cls.is_primary ? '#F59E0B20' : sc + '15',
                  border: `1px solid ${cls.is_primary ? '#F59E0B40' : sc + '30'}`,
                  color: cls.is_primary ? '#F59E0B' : sc,
                  fontSize: '0.65rem', fontWeight: 700,
                  textTransform: 'uppercase' as const,
                }}>
                  {cls.is_primary ? '👑 Class Teacher' : 'Subject Teacher'}
                </span>
              </div>
            ))}

            {/* Subjects summary */}
            {subjectsTaught.length > 0 && (
              <div style={{ padding: 'var(--space-4) var(--space-5)', borderTop: '1px solid var(--glass-border)' }}>
                <p style={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'var(--text-muted)', margin: '0 0 8px' }}>
                  Subjects Taught
                </p>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
                  {subjectsTaught.map(subj => (
                    <span key={subj} style={{
                      padding: '4px 10px', borderRadius: 999,
                      background: sc + '15',
                      border: `1px solid ${sc + '30'}`,
                      color: sc, fontSize: '0.72rem', fontWeight: 600,
                    }}>
                      {subj}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Actions ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <a href="/forgot-password" style={{
          display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
          padding: 'var(--space-4)',
          background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
          borderRadius: 'var(--radius-lg)',
          color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 500,
          textDecoration: 'none',
        }}>
          <KeyIcon size={16} />
          Change Password
        </a>

        <button onClick={logout} style={{
          display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
          padding: 'var(--space-4)',
          background: 'var(--danger-subtle)', border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: 'var(--radius-lg)',
          color: 'var(--danger)', fontSize: '0.85rem', fontWeight: 600,
          cursor: 'pointer', width: '100%', textAlign: 'left' as const,
        }}>
          <LogOutIcon size={16} color="var(--danger)" />
          Sign Out
        </button>
      </div>

      <div style={{ height: 110 }} />
    </RolePageWrapper>
  )
}
