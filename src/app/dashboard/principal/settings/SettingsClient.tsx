'use client'

// src/app/dashboard/principal/settings/SettingsClient.tsx
// FIXED:
//   1. School interface: 'build_image_url' → 'login_bg_image'
//   2. All state variables renamed: buildImageUrl → loginBgImageUrl etc.
//   3. API payload key changed to 'login_bg_image'
//   4. SCHOOL_TYPES updated to match DB enum: 'primary' | 'secondary' | 'combined'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import styles from './settings.module.css'

interface Profile {
  id:        string
  full_name: string
  email:     string
  phone:     string
  school_id: string
  role:      string
}

interface School {
  id:               string
  name:             string
  tagline:          string | null
  address:          string | null
  city:             string | null
  state:            string | null
  phone:            string | null
  email:            string | null
  school_type:      string | null
  primary_color:    string | null
  font_family:      string | null
  logo_url:         string | null
  login_bg_image:   string | null   // ← correct column
  status:           string | null
  subscription_plan: string | null
}

interface Props {
  profile: Profile
  school:  School
}

type Tab = 'identity' | 'branding' | 'contact'

export default function SettingsClient({ profile, school }: Props) {
  const supabase = createClient()

  const [tab, setTab] = useState<Tab>('identity')

  // ── Form fields ────────────────────────────────────────────────────────────
  const [name,         setName]         = useState(school.name          ?? '')
  const [tagline,      setTagline]      = useState(school.tagline        ?? '')
  const [address,      setAddress]      = useState(school.address        ?? '')
  const [city,         setCity]         = useState(school.city           ?? '')
  const [state,        setState]        = useState(school.state          ?? '')
  const [phone,        setPhone]        = useState(school.phone          ?? '')
  const [email,        setEmail]        = useState(school.email          ?? '')
  const [schoolType,   setSchoolType]   = useState(school.school_type    ?? '')
  const [primaryColor, setPrimaryColor] = useState(school.primary_color  ?? '#800020')
  const [fontFamily,   setFontFamily]   = useState(school.font_family    ?? 'Inter')

  // ── Image state — uses correct column name 'login_bg_image' ────────────────
  const [logoUrl,          setLogoUrl]          = useState<string | null>(school.logo_url)
  const [loginBgImageUrl,  setLoginBgImageUrl]  = useState<string | null>(school.login_bg_image)

  const [logoPreview,      setLogoPreview]      = useState<string | null>(school.logo_url)
  const [bgImagePreview,   setBgImagePreview]   = useState<string | null>(school.login_bg_image)

  const [logoUploading,    setLogoUploading]    = useState(false)
  const [bgImageUploading, setBgImageUploading] = useState(false)
  const [logoError,        setLogoError]        = useState<string | null>(null)
  const [bgImageError,     setBgImageError]     = useState<string | null>(null)

  // ── Save state ─────────────────────────────────────────────────────────────
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [saveErr, setSaveErr] = useState<string | null>(null)

  const logoInputRef    = useRef<HTMLInputElement>(null)
  const bgImageInputRef = useRef<HTMLInputElement>(null)

  // ── Upload helper ──────────────────────────────────────────────────────────
  async function uploadImage(
    file: File,
    bucket: string,
    pathPrefix: string,
    onProgress: (v: boolean) => void,
    onError:    (msg: string | null) => void,
    onSuccess:  (url: string) => void,
  ) {
    if (file.size > 5 * 1024 * 1024) { onError('File too large. Maximum size is 5 MB.'); return }
    if (!file.type.startsWith('image/')) { onError('Only image files are accepted.'); return }

    onError(null)
    onProgress(true)

    try {
      const ext      = file.name.split('.').pop() ?? 'png'
      const filePath = `${pathPrefix}/${school.id}/${Date.now()}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(filePath, file, { upsert: true, contentType: file.type })

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(filePath)
      onSuccess(publicUrl)
    } catch (err: any) {
      onError(err?.message ?? 'Upload failed. Please try again.')
    } finally {
      onProgress(false)
    }
  }

  async function onLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setLogoPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
    await uploadImage(file, 'school-assets', 'logos',
      setLogoUploading, setLogoError,
      url => { setLogoUrl(url); setLogoPreview(url) },
    )
  }

  async function onBgImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setBgImagePreview(ev.target?.result as string)
    reader.readAsDataURL(file)
    await uploadImage(file, 'school-assets', 'build-images',
      setBgImageUploading, setBgImageError,
      url => { setLoginBgImageUrl(url); setBgImagePreview(url) },
    )
  }

  function removeLogo() {
    setLogoUrl(null); setLogoPreview(null); setLogoError(null)
    if (logoInputRef.current) logoInputRef.current.value = ''
  }

  function removeBgImage() {
    setLoginBgImageUrl(null); setBgImagePreview(null); setBgImageError(null)
    if (bgImageInputRef.current) bgImageInputRef.current.value = ''
  }

  const [logoOver,  setLogoOver]  = useState(false)
  const [bgOver,    setBgOver]    = useState(false)

  function handleDrop(
    e: React.DragEvent,
    handler: (ev: React.ChangeEvent<HTMLInputElement>) => void,
    inputRef: React.RefObject<HTMLInputElement>,
  ) {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (!file || !inputRef.current) return
    const dt = new DataTransfer()
    dt.items.add(file)
    inputRef.current.files = dt.files
    inputRef.current.dispatchEvent(new Event('change', { bubbles: true }))
  }

  // ── Save — sends correct field names to API ────────────────────────────────
  async function saveSettings() {
    setSaving(true); setSaveErr(null); setSaved(false)

    try {
      const res = await fetch('/api/principal/settings', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          tagline,
          address,
          city,
          state,
          phone,
          email,
          school_type:    schoolType,
          primary_color:  primaryColor,
          font_family:    fontFamily,
          logo_url:       logoUrl,
          login_bg_image: loginBgImageUrl,   // ← correct key
        }),
      })

      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error ?? 'Save failed')

      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err: any) {
      setSaveErr(err?.message ?? 'Could not save changes.')
    } finally {
      setSaving(false)
    }
  }

  // ── Match DB enum values ───────────────────────────────────────────────────
  const SCHOOL_TYPES = [
    { value: 'primary',   label: 'Primary School' },
    { value: 'secondary', label: 'Secondary School' },
    { value: 'combined',  label: 'Primary & Secondary' },
  ]

  const FONTS = ['Inter', 'Poppins', 'Lato', 'Montserrat', 'Nunito', 'Raleway']

  const statusColor: Record<string, string> = {
    active:    'badge-success',
    pending:   'badge-warning',
    suspended: 'badge-error',
    trial:     'badge-info',
  }

  return (
    <div className={styles.page}>

      {/* ── Header ── */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          {logoPreview
            ? <img src={logoPreview} alt="School logo" className={styles.headerLogo} />
            : <div className={styles.headerLogoPlaceholder}>🏫</div>
          }
          <div>
            <p className={styles.schoolName}>{name || 'Your School'}</p>
            <p className={styles.headerSub}>Principal Settings</p>
          </div>
        </div>
        <div className={styles.headerRight}>
          {school.status && (
            <span className={`badge ${statusColor[school.status] ?? 'badge-info'}`}>
              {school.status}
            </span>
          )}
          <button
            className={`${styles.saveBtn} ${saved ? styles.saveBtnSuccess : ''}`}
            onClick={saveSettings}
            disabled={saving}
          >
            {saving ? '⏳ Saving…' : saved ? '✅ Saved!' : '💾 Save Changes'}
          </button>
        </div>
      </header>

      {/* ── Tabs ── */}
      <div className={styles.tabs}>
        {([
          { key: 'identity', label: '🏛 Identity' },
          { key: 'branding', label: '🎨 Branding' },
          { key: 'contact',  label: '📞 Contact'  },
        ] as { key: Tab; label: string }[]).map(({ key, label }) => (
          <button
            key={key}
            className={`${styles.tab} ${tab === key ? styles.tabActive : ''}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div className={styles.content}>

        {saveErr && (
          <div className={`glass-card ${styles.errorBanner}`}>
            ⚠️ {saveErr}
          </div>
        )}

        {/* ════ IDENTITY TAB ════ */}
        {tab === 'identity' && (
          <>
            <p className={styles.sectionLabel}>School Identity</p>

            <div className={`glass-card ${styles.card}`}>
              <div className={styles.fieldGroup}>
                <label className={styles.label}>School Name</label>
                <input
                  className={styles.input}
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Sunshine Academy"
                />
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.label}>Tagline / Motto</label>
                <input
                  className={styles.input}
                  value={tagline}
                  onChange={e => setTagline(e.target.value)}
                  placeholder="e.g. Nurturing Excellence, Building Futures"
                />
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.label}>School Type</label>
                <select
                  className={styles.select}
                  value={schoolType}
                  onChange={e => setSchoolType(e.target.value)}
                >
                  <option value="">— Select type —</option>
                  {SCHOOL_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* ── School Logo ── */}
            <p className={styles.sectionLabel}>School Logo</p>
            <div className={`glass-card ${styles.card}`}>
              <p className={styles.imageHint}>
                Displayed in the school header, report cards, and the SchoolOS portal.
                Recommended: square PNG or SVG, min 200×200 px, max 5 MB.
              </p>

              {logoPreview ? (
                <div className={styles.imagePreviewWrapper}>
                  <img src={logoPreview} alt="Logo preview" className={styles.logoPreview} />
                  <div className={styles.imageActions}>
                    <button className={styles.changeBtn} onClick={() => logoInputRef.current?.click()} disabled={logoUploading}>
                      {logoUploading ? '⏳ Uploading…' : '🔄 Change Logo'}
                    </button>
                    <button className={styles.removeBtn} onClick={removeLogo}>🗑 Remove</button>
                  </div>
                  {logoError && <p className={styles.fileError}>{logoError}</p>}
                </div>
              ) : (
                <div
                  className={`${styles.dropZone} ${logoOver ? styles.dropZoneOver : ''} ${logoUploading ? styles.dropZoneLoading : ''}`}
                  onClick={() => !logoUploading && logoInputRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); setLogoOver(true) }}
                  onDragLeave={() => setLogoOver(false)}
                  onDrop={e => { setLogoOver(false); handleDrop(e, onLogoChange, logoInputRef as React.RefObject<HTMLInputElement>) }}
                >
                  {logoUploading ? (
                    <><span className={styles.dropIcon}>⏳</span><p className={styles.dropTitle}>Uploading logo…</p></>
                  ) : (
                    <><span className={styles.dropIcon}>🏷</span><p className={styles.dropTitle}>Drop your logo here</p><p className={styles.dropSub}>or click to browse — PNG, SVG, JPG · max 5 MB</p></>
                  )}
                </div>
              )}
              {logoError && !logoPreview && <p className={styles.fileError}>{logoError}</p>}
              <input ref={logoInputRef} type="file" accept="image/*" className={styles.hiddenInput} onChange={onLogoChange} />
            </div>

            {/* ── Login Background Image ── */}
            <p className={styles.sectionLabel}>School Building / Login Image</p>
            <div className={`glass-card ${styles.card}`}>
              <p className={styles.imageHint}>
                A wide photo of your school shown on the login page and welcome screens.
                Recommended: landscape 16:9, min 1280×720 px, max 5 MB.
              </p>

              {bgImagePreview ? (
                <div className={styles.buildPreviewWrapper}>
                  <img src={bgImagePreview} alt="Background image preview" className={styles.buildPreview} />
                  <div className={styles.imageActions}>
                    <button className={styles.changeBtn} onClick={() => bgImageInputRef.current?.click()} disabled={bgImageUploading}>
                      {bgImageUploading ? '⏳ Uploading…' : '🔄 Change Image'}
                    </button>
                    <button className={styles.removeBtn} onClick={removeBgImage}>🗑 Remove</button>
                  </div>
                  {bgImageError && <p className={styles.fileError}>{bgImageError}</p>}
                </div>
              ) : (
                <div
                  className={`${styles.dropZone} ${styles.dropZoneWide} ${bgOver ? styles.dropZoneOver : ''} ${bgImageUploading ? styles.dropZoneLoading : ''}`}
                  onClick={() => !bgImageUploading && bgImageInputRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); setBgOver(true) }}
                  onDragLeave={() => setBgOver(false)}
                  onDrop={e => { setBgOver(false); handleDrop(e, onBgImageChange, bgImageInputRef as React.RefObject<HTMLInputElement>) }}
                >
                  {bgImageUploading ? (
                    <><span className={styles.dropIcon}>⏳</span><p className={styles.dropTitle}>Uploading image…</p></>
                  ) : (
                    <><span className={styles.dropIcon}>🏛</span><p className={styles.dropTitle}>Drop your school building photo here</p><p className={styles.dropSub}>or click to browse — JPG, PNG, WebP · max 5 MB · landscape preferred</p></>
                  )}
                </div>
              )}
              {bgImageError && !bgImagePreview && <p className={styles.fileError}>{bgImageError}</p>}
              <input ref={bgImageInputRef} type="file" accept="image/*" className={styles.hiddenInput} onChange={onBgImageChange} />
            </div>
          </>
        )}

        {/* ════ BRANDING TAB ════ */}
        {tab === 'branding' && (
          <>
            <p className={styles.sectionLabel}>Visual Branding</p>

            <div className={`glass-card ${styles.card}`}>
              <div className={styles.fieldGroup}>
                <label className={styles.label}>Primary Brand Colour</label>
                <div className={styles.colorRow}>
                  <input
                    type="color"
                    className={styles.colorPicker}
                    value={primaryColor}
                    onChange={e => setPrimaryColor(e.target.value)}
                  />
                  <input
                    className={`${styles.input} ${styles.colorHex}`}
                    value={primaryColor}
                    onChange={e => {
                      const v = e.target.value
                      if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) setPrimaryColor(v)
                    }}
                    placeholder="#800020"
                    maxLength={7}
                  />
                  <div className={styles.colorSwatch} style={{ background: primaryColor }} />
                </div>
                <p className={styles.fieldHint}>Used for accents, buttons, and highlights across the portal.</p>
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.label}>Portal Font</label>
                <select className={styles.select} value={fontFamily} onChange={e => setFontFamily(e.target.value)}>
                  {FONTS.map(f => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
                </select>
                <p className={styles.fieldHint}>Applied to headings and key UI text in your school's portal.</p>
              </div>
            </div>

            <p className={styles.sectionLabel}>Live Preview</p>
            <div
              className={`glass-card ${styles.brandPreviewCard}`}
              style={{ '--preview-color': primaryColor } as React.CSSProperties}
            >
              <div className={styles.brandPreviewHeader} style={{ background: primaryColor }}>
                {logoPreview
                  ? <img src={logoPreview} alt="Logo" className={styles.brandPreviewLogo} />
                  : <div className={styles.brandPreviewLogoFallback}>🏫</div>
                }
                <div>
                  <p className={styles.brandPreviewSchool} style={{ fontFamily }}>{name || 'Your School'}</p>
                  <p className={styles.brandPreviewTagline}>{tagline || 'Your tagline'}</p>
                </div>
              </div>
              <div className={styles.brandPreviewBody}>
                <p className={styles.brandPreviewBodyText} style={{ fontFamily }}>
                  This is how your school branding will appear to staff, students, and parents.
                </p>
                <button className={styles.brandPreviewBtn} style={{ background: primaryColor, fontFamily }}>
                  Sample Button
                </button>
              </div>
            </div>
          </>
        )}

        {/* ════ CONTACT TAB ════ */}
        {tab === 'contact' && (
          <>
            <p className={styles.sectionLabel}>School Contact Details</p>

            <div className={`glass-card ${styles.card}`}>
              <div className={styles.fieldGroup}>
                <label className={styles.label}>Official Email</label>
                <input className={styles.input} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="info@yourschool.edu.ng" />
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.label}>Phone Number</label>
                <input className={styles.input} type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+234 801 234 5678" />
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.label}>Street Address</label>
                <input className={styles.input} value={address} onChange={e => setAddress(e.target.value)} placeholder="12 Sunshine Avenue" />
              </div>
              <div className={styles.twoCol}>
                <div className={styles.fieldGroup}>
                  <label className={styles.label}>City</label>
                  <input className={styles.input} value={city} onChange={e => setCity(e.target.value)} placeholder="Lagos" />
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.label}>State</label>
                  <input className={styles.input} value={state} onChange={e => setState(e.target.value)} placeholder="Lagos State" />
                </div>
              </div>
            </div>

            <p className={styles.sectionLabel}>Principal Account</p>
            <div className={`glass-card ${styles.card}`}>
              <div className={styles.fieldGroup}>
                <label className={styles.label}>Your Name</label>
                <input className={styles.input} value={profile.full_name} disabled />
                <p className={styles.fieldHint}>Contact support to update your name.</p>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.label}>Your Email</label>
                <input className={styles.input} value={profile.email} disabled />
                <p className={styles.fieldHint}>Contact support to update your login email.</p>
              </div>
            </div>
          </>
        )}

        {/* ── Floating save bar ── */}
        <div className={styles.saveRow}>
          {saveErr && <p className={styles.saveErr}>{saveErr}</p>}
          <button
            className={`${styles.saveBtn} ${styles.saveBtnLarge} ${saved ? styles.saveBtnSuccess : ''}`}
            onClick={saveSettings}
            disabled={saving}
          >
            {saving ? '⏳ Saving Changes…' : saved ? '✅ All Changes Saved!' : '💾 Save All Changes'}
          </button>
        </div>

      </div>
    </div>
  )
}
