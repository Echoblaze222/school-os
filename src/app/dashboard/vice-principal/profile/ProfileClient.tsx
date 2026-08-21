'use client'
// src/app/dashboard/vice-principal/profile/ProfileClient.tsx

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import RoleSubHeader from '@/components/RoleSubHeader'
import { UserIcon, CameraIcon } from '@/components/Icons'
import { VP_FEATURE_GROUPS } from '../featureGroups'
import styles from './profile.module.css'

interface Props { profile: any; school: any; userId: string }

export default function ProfileClient({ profile, school, userId }: Props) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [phone, setPhone] = useState(profile?.phone ?? '')
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url ?? '')
  const [saving, setSaving] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [msg, setMsg] = useState('')

  async function handleSave() {
    setSaving(true); setMsg('')
    const supabase = createClient()
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: fullName.trim(), phone: phone.trim() || null })
      .eq('id', userId)
    setMsg(error ? `Could not save: ${error.message}` : 'Saved.')
    setSaving(false)
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { setMsg('Please choose an image file.'); return }
    if (file.size > 5 * 1024 * 1024) { setMsg('Image must be under 5 MB.'); return }

    setUploadingPhoto(true); setMsg('Uploading photo…')
    const supabase = createClient()
    try {
      const ext = file.name.split('.').pop()
      const path = `${userId}/${Date.now()}.${ext}`

      const { error: uploadErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
      if (uploadErr) { setMsg(`Upload failed: ${uploadErr.message}`); return }

      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      const { error: dbErr } = await supabase.from('profiles').update({ avatar_url: data.publicUrl }).eq('id', userId)
      if (dbErr) { setMsg(`Photo uploaded but saving to profile failed: ${dbErr.message}`); return }

      setAvatarUrl(`${data.publicUrl}?t=${Date.now()}`)
      setMsg('Photo updated.')
    } finally {
      setUploadingPhoto(false)
    }
  }

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <RoleSubHeader
      userId={userId} role="vice-principal" profile={profile} school={school}
      title="My Profile" featureGroups={VP_FEATURE_GROUPS}
    >
      <div className={styles.avatarSection}>
        <button className={styles.avatarWrap} onClick={() => fileRef.current?.click()} disabled={uploadingPhoto}>
          {avatarUrl ? <img src={avatarUrl} alt="" /> : <UserIcon size={28} />}
          <span className={styles.cameraBadge}><CameraIcon size={12} /></span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={handlePhotoChange} />
        <div>
          <p className={styles.roleTag}>Vice Principal</p>
          <p className={styles.email}>{profile?.email}</p>
        </div>
      </div>

      {msg && <p className={styles.msg}>{msg}</p>}

      <label className={styles.label}>Full name</label>
      <input className={styles.input} value={fullName} onChange={e => setFullName(e.target.value)} />

      <label className={styles.label}>Phone</label>
      <input className={styles.input} value={phone} onChange={e => setPhone(e.target.value)} placeholder="Not set" />

      <label className={styles.label}>Employee ID</label>
      <input className={styles.input} value={profile?.employee_id ?? 'Not set'} disabled />

      <button className={styles.saveBtn} onClick={handleSave} disabled={saving || !fullName.trim()}>
        {saving ? 'Saving…' : 'Save changes'}
      </button>

      <button className={styles.signOutBtn} onClick={handleSignOut}>Sign out</button>

      <div style={{ height: 40 }} />
    </RoleSubHeader>
  )
}
