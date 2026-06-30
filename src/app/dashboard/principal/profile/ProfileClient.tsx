'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import {
  UserIcon,
  CameraIcon,
  KeyIcon,
  LogOutIcon,
  EditIcon,
} from '@/components/Icons'

interface Props {
  profile: any
  school: any
  userId: string
}

export default function ProfileClient({
  profile,
  school,
  userId,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [phone, setPhone] = useState(profile?.phone ?? '')
  const [avatar, setAvatar] = useState(profile?.avatar_url ?? '')
  const [msg, setMsg] = useState('')
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

  const fileRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const supabase = createClient()

  const sc = school?.primary_color ?? '#7C3AED'

  async function save() {
    setSaving(true)
    setMsg('')

    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: fullName,
        phone,
        updated_at: new Date().toISOString(),
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

  async function uploadAvatar(
    e: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = e.target.files?.[0]
    if (!file) return

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
      // Use a timestamped path so the browser never serves a stale cached image
      const ext  = file.name.split('.').pop()
      const path = `${userId}_${Date.now()}.${ext}`

      const { error: uploadErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true })

      if (uploadErr) {
        setMsg('Upload failed: ' + uploadErr.message)
        return
      }

      const { data } = supabase.storage
        .from('avatars')
        .getPublicUrl(path)

      // Append a cache-buster so the <img> tag always re-fetches
      const freshUrl = data.publicUrl + '?t=' + Date.now()

      const { error: dbErr } = await supabase
        .from('profiles')
        .update({ avatar_url: data.publicUrl })   // store clean URL in DB
        .eq('id', userId)

      if (dbErr) {
        setMsg('Photo uploaded but saving to profile failed: ' + dbErr.message)
        return
      }

      setAvatar(freshUrl)   // use timestamped URL in state so browser shows new photo
      setMsg('Photo updated!')
    } catch (err: any) {
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

  const fields = [
    ['Full Name', profile?.full_name ?? '—'],
    ['ID Code', profile?.default_code ?? '—'],
    [
      'Role',
      (profile?.role ?? '').charAt(0).toUpperCase() +
        (profile?.role ?? '').slice(1),
    ],
    ['School', school?.name ?? '—'],
    ['Email', profile?.email ?? '—'],
    ['Phone', profile?.phone ?? '—'],
  ]

  return (
    <RolePageWrapper
      userId={userId}
      role="principal"
      profile={profile}
      school={school}
      title="My Profile"
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 'var(--space-5)',
          marginBottom: 'var(--space-7)',
        }}
      >
        <div style={{ position: 'relative' }}>
          <div
            style={{
              width: 84,
              height: 84,
              borderRadius: '50%',
              background: sc,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              border: '3px solid ' + sc + '40',
            }}
          >
            {avatar ? (
              <img
                src={avatar}
                alt=""
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  opacity: uploadingPhoto ? 0.4 : 1,
                }}
              />
            ) : (
              <div style={{ opacity: uploadingPhoto ? 0.4 : 1, display: 'flex' }}>
                <UserIcon size={32} color="white" />
              </div>
            )}
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
              position: 'absolute',
              bottom: 0,
              right: 0,
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: sc,
              border: '2px solid var(--bg-base)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
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
          <p
            style={{
              fontSize: '1.1rem',
              fontWeight: 800,
              color: 'var(--text-primary)',
              margin: '0 0 2px',
            }}
          >
            {profile?.full_name}
          </p>

          <p
            style={{
              fontSize: '0.75rem',
              color: 'var(--text-muted)',
              margin: 0,
              textTransform: 'capitalize',
            }}
          >
            {profile?.role}
          </p>
        </div>
      </div>

      <div
        style={{
          background: 'var(--glass-bg)',
          border: '1px solid var(--glass-border)',
          borderRadius: 'var(--radius-xl)',
          overflow: 'hidden',
          marginBottom: 'var(--space-5)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 'var(--space-4) var(--space-5)',
            borderBottom: '1px solid var(--glass-border)',
          }}
        >
          <p
            style={{
              fontSize: '0.72rem',
              fontWeight: 800,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              margin: 0,
            }}
          >
            Personal Info
          </p>

          <button
            onClick={() => setEditing(!editing)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '5px 12px',
              background: editing
                ? 'var(--glass-bg)'
                : 'var(--brand-subtle)',
              border:
                '1px solid ' +
                (editing
                  ? 'var(--glass-border)'
                  : 'var(--brand-border)'),
              borderRadius: 999,
              color: editing
                ? 'var(--text-muted)'
                : 'var(--brand-light)',
              fontSize: '0.72rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <EditIcon size={11} />
            {editing ? 'Cancel' : 'Edit'}
          </button>
        </div>

        {editing ? (
          <div
            style={{
              padding: 'var(--space-5)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-4)',
            }}
          >
            {[
              ['Full Name', fullName, setFullName],
              ['Phone', phone, setPhone],
            ].map(([label, val, setter]: any) => (
              <div key={label}>
                <label
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    display: 'block',
                    marginBottom: 6,
                  }}
                >
                  {label}
                </label>

                <input
                  value={val}
                  onChange={(e) => setter(e.target.value)}
                  style={{
                    width: '100%',
                    height: 44,
                    padding: '0 14px',
                    background: 'var(--input-bg)',
                    border: '1px solid var(--input-border)',
                    borderRadius: 10,
                    color: 'var(--text-primary)',
                    fontSize: '0.875rem',
                    outline: 'none',
                  }}
                />
              </div>
            ))}

            {msg && (
              <p
                style={{
                  fontSize: '0.78rem',
                  color: msg.includes('!')
                    ? '#10B981'
                    : '#EF4444',
                  margin: 0,
                }}
              >
                {msg}
              </p>
            )}

            <button
              onClick={save}
              disabled={saving}
              style={{
                height: 44,
                background:
                  'linear-gradient(135deg,' +
                  sc +
                  ',' +
                  sc +
                  'cc)',
                color: '#fff',
                border: 'none',
                borderRadius: 10,
                fontWeight: 700,
                fontSize: '0.875rem',
                cursor: 'pointer',
              }}
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        ) : (
          <div>
            {fields.map(([label, value]) => (
              <div
                key={label}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: 'var(--space-3) var(--space-5)',
                  borderBottom: '1px solid var(--glass-border)',
                  fontSize: '0.85rem',
                }}
              >
                <span style={{ color: 'var(--text-muted)' }}>
                  {label}
                </span>

                <span
                  style={{
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                  }}
                >
                  {value}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
        }}
      >
        <a
          href="/forgot-password"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            padding: 'var(--space-4)',
            background: 'var(--glass-bg)',
            border: '1px solid var(--glass-border)',
            borderRadius: 'var(--radius-lg)',
            color: 'var(--text-secondary)',
            fontSize: '0.85rem',
            fontWeight: 500,
            textDecoration: 'none',
          }}
        >
          <KeyIcon size={16} />
          Change Password
        </a>

        <button
          onClick={logout}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            padding: 'var(--space-4)',
            background: 'var(--danger-subtle)',
            border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: 'var(--radius-lg)',
            color: 'var(--danger)',
            fontSize: '0.85rem',
            fontWeight: 600,
            cursor: 'pointer',
            width: '100%',
            textAlign: 'left',
          }}
        >
          <LogOutIcon size={16} color="var(--danger)" />
          Sign Out
        </button>
      </div>

      <div style={{ height: 110 }} />
    </RolePageWrapper>
  )
}
