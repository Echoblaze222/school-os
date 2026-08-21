'use client'

// src/app/principal/settings/SettingsClient.tsx
// Handles: school info editing, logo upload, build image upload

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import styles from './settings.module.css'
import {
  ArrowLeftIcon, SaveIcon, RefreshIcon, TrashIcon, UploadIcon,
  CheckIcon, AlertIcon, SchoolIcon, LayersIcon, PhoneIcon, WalletIcon,
} from '@/components/Icons'

interface Profile {
  id:        string
  full_name: string
  email:     string
  phone:     string
  school_id: string
  role:      string
  signature_url?: string | null
}

interface School {
  id:              string
  name:            string
  tagline:         string | null
  address:         string | null
  city:            string | null
  state:           string | null
  phone:           string | null
  email:           string | null
  school_type:     string | null
  primary_color:   string | null
  secondary_color: string | null
  font_family:     string | null
  logo_url:        string | null
  build_image_url: string | null
  login_bg_image:  string | null
  status:          string | null
  subscription_plan: string | null
  paystack_subaccount_code:   string | null
  paystack_subaccount_active: boolean | null
}

interface Props {
  profile: Profile
  school:  School
}

type Tab = 'identity' | 'branding' | 'contact' | 'banking'

export default function SettingsClient({ profile, school }: Props) {
  const supabase = createClient()
  const router   = useRouter()

  const [tab, setTab] = useState<Tab>('identity')

  // ── Form fields ─────────────────────────────────────────────────────────────
  const [name,        setName]        = useState(school.name        ?? '')
  const [tagline,     setTagline]     = useState(school.tagline     ?? '')
  const [address,     setAddress]     = useState(school.address     ?? '')
  const [city,        setCity]        = useState(school.city        ?? '')
  const [state,       setState]       = useState(school.state       ?? '')
  const [phone,       setPhone]       = useState(school.phone       ?? '')
  const [email,       setEmail]       = useState(school.email       ?? '')
  const [schoolType,  setSchoolType]  = useState(school.school_type ?? '')
  const [primaryColor,setPrimaryColor]= useState(school.primary_color ?? '#800020')
  const [secondaryColor,setSecondaryColor]= useState(school.secondary_color ?? '#C99A3B')
  const [fontFamily,  setFontFamily]  = useState(school.font_family ?? 'Inter')

  // ── Banking fields ───────────────────────────────────────────────────────────
  const [bankName,      setBankName]      = useState((school as any).bank_name      ?? '')
  const [accountNumber, setAccountNumber] = useState((school as any).account_number ?? '')
  const [accountName,   setAccountName]   = useState((school as any).account_name   ?? '')

  const [paystackActive,    setPaystackActive]    = useState(school.paystack_subaccount_active ?? false)
  const [connectingPaystack, setConnectingPaystack] = useState(false)
  const [paystackMsg,        setPaystackMsg]        = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // ── Image state ──────────────────────────────────────────────────────────────
  const [logoUrl,       setLogoUrl]       = useState<string | null>(school.logo_url)
  const [buildImageUrl, setBuildImageUrl] = useState<string | null>(school.build_image_url)

  const [logoPreview,       setLogoPreview]       = useState<string | null>(school.logo_url)
  const [buildImagePreview, setBuildImagePreview] = useState<string | null>(school.build_image_url)

  const [logoUploading,       setLogoUploading]       = useState(false)
  const [sigUrl,     setSigUrl]     = useState<string | null>(profile?.signature_url ?? null)
  const [sigPreview, setSigPreview] = useState<string | null>(profile?.signature_url ?? null)
  const [sigUploading, setSigUploading] = useState(false)
  const [sigError,     setSigError]     = useState<string | null>(null)
  const [sigOver,       setSigOver]     = useState(false)
  const [buildImageUploading, setBuildImageUploading] = useState(false)
  const [logoError,           setLogoError]           = useState<string | null>(null)
  const [buildImageError,     setBuildImageError]     = useState<string | null>(null)

  // ── Save state ───────────────────────────────────────────────────────────────
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [saveErr, setSaveErr] = useState<string | null>(null)

  const logoInputRef       = useRef<HTMLInputElement>(null)
  const sigInputRef        = useRef<HTMLInputElement>(null)
  const buildImageInputRef = useRef<HTMLInputElement>(null)

  // ── Upload helper ────────────────────────────────────────────────────────────
  async function uploadImage(
    file: File,
    bucket: string,
    pathPrefix: string,
    onProgress: (uploading: boolean) => void,
    onError:    (msg: string | null) => void,
    onSuccess:  (url: string) => void,
  ) {
    const MAX_MB = 5
    if (file.size > MAX_MB * 1024 * 1024) {
      onError(`File too large. Maximum size is ${MAX_MB} MB.`)
      return
    }
    if (!file.type.startsWith('image/')) {
      onError('Only image files are accepted.')
      return
    }

    onError(null)
    onProgress(true)

    try {
      const ext      = file.name.split('.').pop() ?? 'png'
      const filePath = `${pathPrefix}/${school.id}/${Date.now()}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(filePath, file, { upsert: true, contentType: file.type })

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from(bucket)
        .getPublicUrl(filePath)

      onSuccess(publicUrl)
    } catch (err: any) {
      onError(err?.message ?? 'Upload failed. Please try again.')
    } finally {
      onProgress(false)
    }
  }

  // ── Signature file pick ──────────────────────────────────────────────────────
  async function onSigChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = ev => setSigPreview(ev.target?.result as string)
    reader.readAsDataURL(file)

    await uploadImage(
      file,
      'school-assets',
      'signatures',
      setSigUploading,
      setSigError,
      async url => {
        setSigUrl(url)
        setSigPreview(url)
        // Signature is a personal (profile) field, not part of the school
        // branding form - save it immediately rather than waiting for the
        // main "Save" button.
        const { error } = await supabase.from('profiles').update({ signature_url: url }).eq('id', profile.id)
        if (error) setSigError(error.message)
      },
    )
  }

  function removeSig() {
    setSigUrl(null)
    setSigPreview(null)
    setSigError(null)
    supabase.from('profiles').update({ signature_url: null }).eq('id', profile.id)
  }

  // ── Logo file pick ───────────────────────────────────────────────────────────
  async function onLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // Local preview immediately
    const reader = new FileReader()
    reader.onload = ev => setLogoPreview(ev.target?.result as string)
    reader.readAsDataURL(file)

    await uploadImage(
      file,
      'school-assets',
      'logos',
      setLogoUploading,
      setLogoError,
      url => { setLogoUrl(url); setLogoPreview(url) },
    )
  }

  // ── Build image file pick ────────────────────────────────────────────────────
  async function onBuildImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = ev => setBuildImagePreview(ev.target?.result as string)
    reader.readAsDataURL(file)

    await uploadImage(
      file,
      'school-assets',
      'build-images',
      setBuildImageUploading,
      setBuildImageError,
      url => { setBuildImageUrl(url); setBuildImagePreview(url) },
    )
  }

  // ── Remove image ─────────────────────────────────────────────────────────────
  function removeLogo() {
    setLogoUrl(null)
    setLogoPreview(null)
    setLogoError(null)
    if (logoInputRef.current) logoInputRef.current.value = ''
  }

  function removeBuildImage() {
    setBuildImageUrl(null)
    setBuildImagePreview(null)
    setBuildImageError(null)
    if (buildImageInputRef.current) buildImageInputRef.current.value = ''
  }

  // ── Drag-and-drop ────────────────────────────────────────────────────────────
  const [logoOver,  setLogoOver]  = useState(false)
  const [buildOver, setBuildOver] = useState(false)

  function handleDrop(
    e: React.DragEvent,
    handler: (ev: React.ChangeEvent<HTMLInputElement>) => void,
    inputRef: React.RefObject<HTMLInputElement>,
  ) {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (!file || !inputRef.current) return
    // Synthetic change event
    const dt = new DataTransfer()
    dt.items.add(file)
    inputRef.current.files = dt.files
    inputRef.current.dispatchEvent(new Event('change', { bubbles: true }))
  }

  // ── Save all settings ────────────────────────────────────────────────────────
  async function saveSettings() {
    setSaving(true)
    setSaveErr(null)
    setSaved(false)

    try {
      if (tab === 'banking') {
        // Validate NUBAN length before writing - a partial number is worse than none
        if (accountNumber && accountNumber.length !== 10) {
          throw new Error('Account number must be exactly 10 digits.')
        }

        // Banking details save directly via Supabase client
        const { error } = await supabase
          .from('schools')
          .update({
            bank_name:      bankName,
            account_number: accountNumber,
            account_name:   accountName,
          })
          .eq('id', school.id)

        if (error) throw error
      } else {
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
            school_type:     schoolType,
            primary_color:   primaryColor,
            secondary_color: secondaryColor,
            font_family:     fontFamily,
            logo_url:        logoUrl,
            build_image_url: buildImageUrl,
          }),
        })

        const json = await res.json()
        if (!res.ok || json.error) throw new Error(json.error ?? 'Save failed')
      }

      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err: any) {
      setSaveErr(err?.message ?? 'Could not save changes.')
    } finally {
      setSaving(false)
    }
  }

  async function connectPaystack() {
    setConnectingPaystack(true)
    setPaystackMsg(null)
    try {
      // Save current bank fields first so the server route reads up-to-date values
      if (!bankName || !accountNumber || !accountName) {
        throw new Error('Fill in bank name, account number, and account name above first.')
      }
      if (accountNumber.length !== 10) {
        throw new Error('Account number must be exactly 10 digits.')
      }

      const { error: saveErr } = await supabase
        .from('schools')
        .update({ bank_name: bankName, account_number: accountNumber, account_name: accountName })
        .eq('id', school.id)
      if (saveErr) throw saveErr

      const res  = await fetch('/api/paystack/create-subaccount', { method: 'POST' })
      const json = await res.json()

      if (!res.ok || json.error) throw new Error(json.error ?? 'Could not connect Paystack.')

      setPaystackActive(true)
      setPaystackMsg({
        type: 'success',
        text: `Connected! Paystack verified the account name as "${json.resolved_account_name}".`,
      })
    } catch (err: any) {
      setPaystackMsg({ type: 'error', text: err?.message ?? 'Could not connect Paystack.' })
    } finally {
      setConnectingPaystack(false)
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const SCHOOL_TYPES = [
    'Nursery',
    'Primary',
    'Secondary',
    'Nursery & Primary',
    'Primary & Secondary',
    'Nursery, Primary & Secondary',
    'Tertiary',
  ]

  const FONTS = ['Inter', 'Poppins', 'Lato', 'Montserrat', 'Nunito', 'Raleway']

  const NIGERIAN_BANKS = [
    'Access Bank',
    'Citibank Nigeria',
    'Ecobank Nigeria',
    'Fidelity Bank',
    'First Bank of Nigeria',
    'First City Monument Bank (FCMB)',
    'Guaranty Trust Bank (GTBank)',
    'Heritage Bank',
    'Keystone Bank',
    'Polaris Bank',
    'Providus Bank',
    'Stanbic IBTC Bank',
    'Standard Chartered Bank',
    'Sterling Bank',
    'SunTrust Bank',
    'Union Bank of Nigeria',
    'United Bank for Africa (UBA)',
    'Unity Bank',
    'Wema Bank',
    'Zenith Bank',
    'Opay',
    'Moniepoint',
    'Kuda Bank',
    'PalmPay',
  ]

  const statusColor: Record<string, string> = {
    active:    'badge-success',
    pending:   'badge-warning',
    suspended: 'badge-error',
    Trial:     'badge-info',
  }

  return (
    <div className={styles.page}>

      {/* ── Header ── */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <button
            className={`${styles.backBtn} pressable`}
            onClick={() => router.push('/dashboard/principal')}
            aria-label="Back to dashboard"
          >
            <ArrowLeftIcon size={20} />
          </button>
          {logoPreview
            ? <img src={logoPreview} alt="School logo" className={styles.headerLogo} />
            : <div className={styles.headerLogoPlaceholder}><SchoolIcon size={20} /></div>
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
            className={`${styles.saveBtn} ${saved ? styles.saveBtnSuccess : ''} pressable`}
            onClick={saveSettings}
            disabled={saving}
          >
            {saving
              ? <><RefreshIcon size={16} /> Saving…</>
              : saved
              ? <><CheckIcon size={16} /> Saved!</>
              : <><SaveIcon size={16} /> Save Changes</>
            }
          </button>
        </div>
      </header>

      {/* ── Tabs ── */}
      <div className={styles.tabs}>
        {([
          { key: 'identity', label: 'Identity', Icon: SchoolIcon },
          { key: 'branding', label: 'Branding', Icon: LayersIcon },
          { key: 'contact',  label: 'Contact',  Icon: PhoneIcon  },
          { key: 'banking',  label: 'Banking',  Icon: WalletIcon },
        ] as { key: Tab; label: string; Icon: typeof SchoolIcon }[]).map(({ key, label, Icon }) => (
          <button
            key={key}
            className={`${styles.tab} ${tab === key ? styles.tabActive : ''} pressable`}
            onClick={() => setTab(key)}
          >
            <Icon size={16} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div className={styles.content}>

        {saveErr && (
          <div className={`glass-card ${styles.errorBanner}`}>
            <AlertIcon size={16} /> {saveErr}
          </div>
        )}

        {/* ════════════════ IDENTITY TAB ════════════════ */}
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
                  <option value="">Select type</option>
                  {SCHOOL_TYPES.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* ── School Logo ── */}
            <p className={styles.sectionLabel}>School Logo</p>
            <div className={`glass-card ${styles.card}`}>
              <p className={styles.imageHint}>
                Displayed in the school header, report cards, invoices, and the SchoolOS portal.
                Recommended: square PNG or SVG, min 200×200 px, max 5 MB.
              </p>

              {logoPreview ? (
                <div className={styles.imagePreviewWrapper}>
                  <img src={logoPreview} alt="Logo preview" className={styles.logoPreview} />
                  <div className={styles.imageActions}>
                    <button
                      className={`${styles.changeBtn} pressable`}
                      onClick={() => logoInputRef.current?.click()}
                      disabled={logoUploading}
                    >
                      {logoUploading ? <><RefreshIcon size={14} /> Uploading…</> : <><RefreshIcon size={14} /> Change Logo</>}
                    </button>
                    <button className={`${styles.removeBtn} pressable`} onClick={removeLogo}>
                      <TrashIcon size={14} /> Remove
                    </button>
                  </div>
                  {logoError && <p className={styles.fileError}>{logoError}</p>}
                </div>
              ) : (
                <div
                  className={`${styles.dropZone} ${logoOver ? styles.dropZoneOver : ''} ${logoUploading ? styles.dropZoneLoading : ''}`}
                  onClick={() => !logoUploading && logoInputRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); setLogoOver(true)  }}
                  onDragLeave={() => setLogoOver(false)}
                  onDrop={e => {
                    setLogoOver(false)
                    handleDrop(e, onLogoChange, logoInputRef as React.RefObject<HTMLInputElement>)
                  }}
                >
                  {logoUploading ? (
                    <>
                      <RefreshIcon size={28} />
                      <p className={styles.dropTitle}>Uploading logo…</p>
                    </>
                  ) : (
                    <>
                      <UploadIcon size={28} />
                      <p className={styles.dropTitle}>Drop your logo here</p>
                      <p className={styles.dropSub}>or click to browse (PNG, SVG, JPG · max 5 MB)</p>
                    </>
                  )}
                </div>
              )}

              {logoError && !logoPreview && (
                <p className={styles.fileError}>{logoError}</p>
              )}

              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                className={styles.hiddenInput}
                onChange={onLogoChange}
              />
            </div>

            {/* ── Principal's Signature ── */}
            <p className={styles.sectionLabel}>Your Signature</p>
            <div className={`glass-card ${styles.card}`}>
              <p className={styles.imageHint}>
                Appears on every report card you approve. Upload a photo or scan of your
                signature on a plain background. PNG with a transparent background works best.
              </p>

              {sigPreview ? (
                <div className={styles.imagePreviewWrapper}>
                  <img src={sigPreview} alt="Signature preview" className={styles.logoPreview} />
                  <div className={styles.imageActions}>
                    <button
                      className={`${styles.changeBtn} pressable`}
                      onClick={() => sigInputRef.current?.click()}
                      disabled={sigUploading}
                    >
                      {sigUploading ? <><RefreshIcon size={14} /> Uploading…</> : <><RefreshIcon size={14} /> Change Signature</>}
                    </button>
                    <button className={`${styles.removeBtn} pressable`} onClick={removeSig}>
                      <TrashIcon size={14} /> Remove
                    </button>
                  </div>
                  {sigError && <p className={styles.fileError}>{sigError}</p>}
                </div>
              ) : (
                <div
                  className={`${styles.dropZone} ${sigOver ? styles.dropZoneOver : ''} ${sigUploading ? styles.dropZoneLoading : ''}`}
                  onClick={() => !sigUploading && sigInputRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); setSigOver(true) }}
                  onDragLeave={() => setSigOver(false)}
                  onDrop={e => {
                    setSigOver(false)
                    handleDrop(e, onSigChange, sigInputRef as React.RefObject<HTMLInputElement>)
                  }}
                >
                  {sigUploading ? (
                    <>
                      <RefreshIcon size={28} />
                      <p className={styles.dropTitle}>Uploading signature…</p>
                    </>
                  ) : (
                    <>
                      <UploadIcon size={28} />
                      <p className={styles.dropTitle}>Drop your signature here</p>
                      <p className={styles.dropSub}>or click to browse (PNG, JPG · max 5 MB)</p>
                    </>
                  )}
                </div>
              )}

              {sigError && !sigPreview && (
                <p className={styles.fileError}>{sigError}</p>
              )}

              <input
                ref={sigInputRef}
                type="file"
                accept="image/*"
                className={styles.hiddenInput}
                onChange={onSigChange}
              />
            </div>

            {/* ── Build Image ── */}
            <p className={styles.sectionLabel}>School Build Image</p>
            <div className={`glass-card ${styles.card}`}>
              <p className={styles.imageHint}>
                A wide photo of your school building, campus, or classrooms.
                Shown on the login page, welcome screens, and school profile.
                Recommended: landscape 16:9, min 1280×720 px, max 5 MB.
              </p>

              {buildImagePreview ? (
                <div className={styles.buildPreviewWrapper}>
                  <img src={buildImagePreview} alt="Build image preview" className={styles.buildPreview} />
                  <div className={styles.imageActions}>
                    <button
                      className={`${styles.changeBtn} pressable`}
                      onClick={() => buildImageInputRef.current?.click()}
                      disabled={buildImageUploading}
                    >
                      {buildImageUploading ? <><RefreshIcon size={14} /> Uploading…</> : <><RefreshIcon size={14} /> Change Image</>}
                    </button>
                    <button className={`${styles.removeBtn} pressable`} onClick={removeBuildImage}>
                      <TrashIcon size={14} /> Remove
                    </button>
                  </div>
                  {buildImageError && <p className={styles.fileError}>{buildImageError}</p>}
                </div>
              ) : (
                <div
                  className={`${styles.dropZone} ${styles.dropZoneWide} ${buildOver ? styles.dropZoneOver : ''} ${buildImageUploading ? styles.dropZoneLoading : ''}`}
                  onClick={() => !buildImageUploading && buildImageInputRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); setBuildOver(true)  }}
                  onDragLeave={() => setBuildOver(false)}
                  onDrop={e => {
                    setBuildOver(false)
                    handleDrop(e, onBuildImageChange, buildImageInputRef as React.RefObject<HTMLInputElement>)
                  }}
                >
                  {buildImageUploading ? (
                    <>
                      <RefreshIcon size={28} />
                      <p className={styles.dropTitle}>Uploading image…</p>
                    </>
                  ) : (
                    <>
                      <SchoolIcon size={28} />
                      <p className={styles.dropTitle}>Drop your school building photo here</p>
                      <p className={styles.dropSub}>or click to browse (JPG, PNG, WebP · max 5 MB · landscape preferred)</p>
                    </>
                  )}
                </div>
              )}

              {buildImageError && !buildImagePreview && (
                <p className={styles.fileError}>{buildImageError}</p>
              )}

              <input
                ref={buildImageInputRef}
                type="file"
                accept="image/*"
                className={styles.hiddenInput}
                onChange={onBuildImageChange}
              />
            </div>
          </>
        )}

        {/* ════════════════ BRANDING TAB ════════════════ */}
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
                  <div
                    className={styles.colorSwatch}
                    style={{ background: primaryColor }}
                  />
                </div>
                <p className={styles.fieldHint}>
                  Used for accents, buttons, and highlights across the portal.
                </p>
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.label}>Secondary Brand Colour</label>
                <div className={styles.colorRow}>
                  <input
                    type="color"
                    className={styles.colorPicker}
                    value={secondaryColor}
                    onChange={e => setSecondaryColor(e.target.value)}
                  />
                  <input
                    className={`${styles.input} ${styles.colorHex}`}
                    value={secondaryColor}
                    onChange={e => {
                      const v = e.target.value
                      if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) setSecondaryColor(v)
                    }}
                    placeholder="#C99A3B"
                    maxLength={7}
                  />
                  <div
                    className={styles.colorSwatch}
                    style={{ background: secondaryColor }}
                  />
                </div>
                <p className={styles.fieldHint}>
                  Used for the "All features" button, stat highlights, and other secondary accents. Defaults to gold if left unset.
                </p>
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.label}>Portal Font</label>
                <select
                  className={styles.select}
                  value={fontFamily}
                  onChange={e => setFontFamily(e.target.value)}
                >
                  {FONTS.map(f => (
                    <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
                  ))}
                </select>
                <p className={styles.fieldHint}>
                  Applied to headings and key UI text in your school's portal.
                </p>
              </div>
            </div>

            {/* Live preview */}
            <p className={styles.sectionLabel}>Live Preview</p>
            <div
              className={`glass-card ${styles.brandPreviewCard}`}
              style={{ '--preview-color': primaryColor } as React.CSSProperties}
            >
              <div className={styles.brandPreviewHeader} style={{ background: primaryColor }}>
                {logoPreview
                  ? <img src={logoPreview} alt="Logo" className={styles.brandPreviewLogo} />
                  : <div className={styles.brandPreviewLogoFallback}><SchoolIcon size={24} /></div>
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
                <div className={styles.brandPreviewBtnRow}>
                  <button
                    className={`${styles.brandPreviewBtn} pressable`}
                    style={{ background: primaryColor, fontFamily }}
                  >
                    Primary
                  </button>
                  <button
                    className={`${styles.brandPreviewBtn} pressable`}
                    style={{ background: secondaryColor, fontFamily }}
                  >
                    Secondary
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ════════════════ CONTACT TAB ════════════════ */}
        {tab === 'contact' && (
          <>
            <p className={styles.sectionLabel}>School Contact Details</p>

            <div className={`glass-card ${styles.card}`}>
              <div className={styles.fieldGroup}>
                <label className={styles.label}>Official Email</label>
                <input
                  className={styles.input}
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="info@yourschool.edu.ng"
                />
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.label}>Phone Number</label>
                <input
                  className={styles.input}
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+234 801 234 5678"
                />
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.label}>Street Address</label>
                <input
                  className={styles.input}
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  placeholder="12 Sunshine Avenue"
                />
              </div>

              <div className={styles.twoCol}>
                <div className={styles.fieldGroup}>
                  <label className={styles.label}>City</label>
                  <input
                    className={styles.input}
                    value={city}
                    onChange={e => setCity(e.target.value)}
                    placeholder="Lagos"
                  />
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.label}>State</label>
                  <input
                    className={styles.input}
                    value={state}
                    onChange={e => setState(e.target.value)}
                    placeholder="Lagos State"
                  />
                </div>
              </div>
            </div>

            <p className={styles.sectionLabel}>Principal Account</p>
            <div className={`glass-card ${styles.card}`}>
              <div className={styles.fieldGroup}>
                <label className={styles.label}>Your Name</label>
                <input
                  className={styles.input}
                  value={profile.full_name}
                  disabled
                  title="Contact support to change your name"
                />
                <p className={styles.fieldHint}>Contact support to update your name.</p>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.label}>Your Email</label>
                <input
                  className={styles.input}
                  value={profile.email}
                  disabled
                  title="Contact support to change your email"
                />
                <p className={styles.fieldHint}>Contact support to update your login email.</p>
              </div>
            </div>
          </>
        )}

        {/* ════════════════ BANKING TAB ════════════════ */}
        {tab === 'banking' && (
          <>
            <p className={styles.sectionLabel}>School Bank Account</p>

            <div className={`glass-card ${styles.card}`}>
              <p className={styles.imageHint}>
                These details appear on invoices and payment receipts sent to parents.
                Make sure they match your school's official bank account exactly.
              </p>

              <div className={styles.fieldGroup}>
                <label className={styles.label}>Bank Name</label>
                <select
                  className={styles.select}
                  value={bankName}
                  onChange={e => setBankName(e.target.value)}
                >
                  <option value="">Select bank</option>
                  {NIGERIAN_BANKS.map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.label}>Account Number</label>
                <input
                  className={styles.input}
                  value={accountNumber}
                  onChange={e => {
                    // digits only, max 10
                    const v = e.target.value.replace(/\D/g, '').slice(0, 10)
                    setAccountNumber(v)
                  }}
                  placeholder="0123456789"
                  inputMode="numeric"
                  maxLength={10}
                />
                <p className={styles.fieldHint}>10-digit NUBAN account number.</p>
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.label}>Account Name</label>
                <input
                  className={styles.input}
                  value={accountName}
                  onChange={e => setAccountName(e.target.value)}
                  placeholder="e.g. Sunshine Academy Schools Ltd"
                />
                <p className={styles.fieldHint}>Must match the name on the bank account exactly.</p>
              </div>
            </div>

            {/* Preview card */}
            {(bankName || accountNumber || accountName) && (
              <>
                <p className={styles.sectionLabel}>Preview</p>
                <div className={`glass-card ${styles.card}`}>
                  <p className={styles.imageHint}>
                    This is how your bank details will appear on invoices and receipts.
                  </p>
                  <div className={styles.bankPreview}>
                    <div className={styles.bankPreviewRow}>
                      <span className={styles.bankPreviewKey}>Bank</span>
                      <span className={styles.bankPreviewVal}>{bankName || 'N/A'}</span>
                    </div>
                    <div className={styles.bankPreviewRow}>
                      <span className={styles.bankPreviewKey}>Account No.</span>
                      <span className={styles.bankPreviewVal}>{accountNumber || 'N/A'}</span>
                    </div>
                    <div className={styles.bankPreviewRow}>
                      <span className={styles.bankPreviewKey}>Account Name</span>
                      <span className={styles.bankPreviewVal}>{accountName || 'N/A'}</span>
                    </div>
                  </div>
                </div>
              </>
            )}
            {/* Paystack online payments */}
            <p className={styles.sectionLabel}>Online Payments</p>
            <div className={`glass-card ${styles.card}`}>
              <p className={styles.imageHint}>
                Connect this account so parents can pay fees online via card, bank transfer,
                or USSD. Paystack settles 97% directly to your bank account above.
                3% is the platform fee, deducted automatically per transaction. You never
                need a Paystack account of your own.
              </p>

              {paystackActive ? (
                <div className={styles.bankPreview} style={{ marginTop: 12 }}>
                  <div className={styles.bankPreviewRow}>
                    <span className={styles.bankPreviewKey}>Status</span>
                    <span className={styles.bankPreviewVal} style={{ color: '#10B981' }}>
                      <CheckIcon size={14} /> Connected
                    </span>
                  </div>
                  <button
                    className={`${styles.changeBtn} pressable`}
                    onClick={connectPaystack}
                    disabled={connectingPaystack}
                    style={{ marginTop: 12 }}
                  >
                    {connectingPaystack
                      ? <><RefreshIcon size={14} /> Updating…</>
                      : <><RefreshIcon size={14} /> Refresh / Update Bank Details</>
                    }
                  </button>
                </div>
              ) : (
                <button
                  className={`${styles.saveBtn} pressable`}
                  onClick={connectPaystack}
                  disabled={connectingPaystack}
                  style={{ marginTop: 12 }}
                >
                  {connectingPaystack
                    ? <><RefreshIcon size={16} /> Connecting…</>
                    : <><WalletIcon size={16} /> Connect Paystack</>
                  }
                </button>
              )}

              {paystackMsg && (
                <p
                  className={paystackMsg.type === 'error' ? styles.fieldError : styles.fieldHint}
                  style={{ marginTop: 10, color: paystackMsg.type === 'success' ? '#10B981' : undefined }}
                >
                  {paystackMsg.type === 'error' && <AlertIcon size={14} />} {paystackMsg.text}
                </p>
              )}
            </div>
          </>
        )}

        {/* ── Floating save row ── */}
        <div className={styles.saveRow}>
          {saveErr && <p className={styles.saveErr}>{saveErr}</p>}
          <button
            className={`${styles.saveBtn} ${styles.saveBtnLarge} ${saved ? styles.saveBtnSuccess : ''} pressable`}
            onClick={saveSettings}
            disabled={saving}
          >
            {saving
              ? <><RefreshIcon size={16} /> Saving Changes…</>
              : saved
              ? <><CheckIcon size={16} /> All Changes Saved!</>
              : <><SaveIcon size={16} /> Save All Changes</>
            }
          </button>
        </div>

      </div>
    </div>
  )
}