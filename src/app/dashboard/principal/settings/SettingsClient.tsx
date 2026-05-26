'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { SchoolIcon, WalletIcon, SaveIcon } from '@/components/Icons'
import styles from '@/app/dashboard/student/records/page.module.css'

interface Props { profile: any; school: any; userId: string }
type Section = 'school' | 'bank'

export default function SettingsClient({ profile, school, userId }: Props) {
  const [section, setSection] = useState<Section>('school')
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)

  const [schoolForm, setSchoolForm] = useState({
    name:          school?.name          ?? '',
    address:       school?.address       ?? '',
    phone:         school?.phone         ?? '',
    email:         school?.email         ?? '',
    primary_color: school?.primary_color ?? '#7C3AED',
  })

  const [bankForm, setBankForm] = useState({
    bank_name:      school?.bank_name      ?? '',
    account_number: school?.account_number ?? '',
    account_name:   school?.account_name   ?? '',
  })

  const supabase = createClient()
  const sc       = school?.primary_color ?? '#7C3AED'

  async function save() {
    setSaving(true); setSaved(false)
    const updates = section === 'school' ? schoolForm : bankForm
    await supabase.from('schools').update(updates).eq('id', school?.id)
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const inp: React.CSSProperties = {
    width:'100%', height:44, padding:'0 14px', background:'var(--input-bg)',
    border:'1px solid var(--input-border)', borderRadius:10,
    color:'var(--text-primary)', fontSize:'0.85rem', outline:'none'
  }
  const lbl: React.CSSProperties = {
    fontSize:'0.72rem', fontWeight:700, color:'var(--text-muted)',
    letterSpacing:'0.05em', marginBottom:6, display:'block'
  }

  const SECTIONS: { key: Section; label: string; Icon: any }[] = [
    { key:'school', label:'School Info',  Icon: SchoolIcon },
    { key:'bank',   label:'Bank Account', Icon: WalletIcon },
  ]

  return (
    <RolePageWrapper userId={userId} role="principal" profile={profile} school={school} title="Settings">
      {/* Section switcher */}
      <div style={{ display:'flex', gap:'var(--space-3)', marginBottom:'var(--space-6)' }}>
        {SECTIONS.map(s => (
          <button key={s.key} onClick={() => { setSection(s.key); setSaved(false) }}
            style={{ flex:1, height:48, display:'flex', alignItems:'center', justifyContent:'center', gap:8,
              background: section===s.key ? sc+'18' : 'var(--input-bg)',
              border: `1px solid ${section===s.key ? sc : 'var(--input-border)'}`,
              borderRadius:10, color: section===s.key ? sc : 'var(--text-muted)',
              fontWeight:700, fontSize:'0.8rem', cursor:'pointer', transition:'all 0.15s' }}>
            <s.Icon size={15} color={section===s.key ? sc : 'var(--text-muted)'}/>
            {s.label}
          </button>
        ))}
      </div>

      {/* ── School Info ────────────────────────────────────── */}
      {section === 'school' && (
        <div style={{ display:'grid', gap:'var(--space-4)' }}>
          <div>
            <label style={lbl}>SCHOOL NAME</label>
            <input value={schoolForm.name}
              onChange={e => setSchoolForm(p => ({...p, name:e.target.value}))} style={inp}/>
          </div>
          <div>
            <label style={lbl}>ADDRESS</label>
            <input value={schoolForm.address}
              onChange={e => setSchoolForm(p => ({...p, address:e.target.value}))} style={inp}/>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'var(--space-3)' }}>
            <div>
              <label style={lbl}>PHONE</label>
              <input value={schoolForm.phone}
                onChange={e => setSchoolForm(p => ({...p, phone:e.target.value}))} style={inp}/>
            </div>
            <div>
              <label style={lbl}>EMAIL</label>
              <input value={schoolForm.email}
                onChange={e => setSchoolForm(p => ({...p, email:e.target.value}))} style={inp}/>
            </div>
          </div>
          <div>
            <label style={lbl}>BRAND COLOUR</label>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <input type="color" value={schoolForm.primary_color}
                onChange={e => setSchoolForm(p => ({...p, primary_color:e.target.value}))}
                style={{ width:44, height:44, border:'none', background:'none',
                  cursor:'pointer', padding:0, borderRadius:8 }}/>
              <input value={schoolForm.primary_color}
                onChange={e => setSchoolForm(p => ({...p, primary_color:e.target.value}))}
                placeholder="#7C3AED" style={{ ...inp, flex:1 }}/>
            </div>
          </div>
        </div>
      )}

      {/* ── Bank Account ───────────────────────────────────── */}
      {section === 'bank' && (
        <div style={{ display:'grid', gap:'var(--space-4)' }}>
          <div style={{ padding:'var(--space-4)', background:sc+'12',
            border:`1px solid ${sc}30`, borderRadius:10 }}>
            <p style={{ fontSize:'0.78rem', color:sc, fontWeight:700, margin:'0 0 4px' }}>
              Used on fee receipts
            </p>
            <p style={{ fontSize:'0.73rem', color:'var(--text-muted)', margin:0 }}>
              This account will appear on student fee receipts and payment instructions for parents.
            </p>
          </div>
          <div>
            <label style={lbl}>BANK NAME</label>
            <input placeholder="e.g. First Bank of Nigeria" value={bankForm.bank_name}
              onChange={e => setBankForm(p => ({...p, bank_name:e.target.value}))} style={inp}/>
          </div>
          <div>
            <label style={lbl}>ACCOUNT NUMBER</label>
            <input placeholder="10-digit account number" value={bankForm.account_number}
              onChange={e => setBankForm(p => ({...p, account_number:e.target.value}))}
              maxLength={10} style={inp}/>
          </div>
          <div>
            <label style={lbl}>ACCOUNT NAME</label>
            <input placeholder="Name on the bank account" value={bankForm.account_name}
              onChange={e => setBankForm(p => ({...p, account_name:e.target.value}))} style={inp}/>
          </div>
        </div>
      )}

      {/* Save */}
      <button onClick={save} disabled={saving}
        style={{ width:'100%', height:48, background: saved ? '#10B981' : sc, color:'#fff',
          border:'none', borderRadius:10, fontWeight:700, fontSize:'0.9rem', cursor:'pointer',
          marginTop:'var(--space-6)', display:'flex', alignItems:'center',
          justifyContent:'center', gap:8, opacity:saving?0.7:1, transition:'background 0.2s' }}>
        <SaveIcon size={16} color="#fff"/>
        {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save Changes'}
      </button>

      <div className={styles.spacer}/>
    </RolePageWrapper>
  )
}
