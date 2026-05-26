'use client'
import { useState, useEffect } from 'react'
import {
  PlusIcon, TrashIcon, EditIcon,
  CheckCircleIcon,
} from '@/components/Icons'
import styles from './settings.module.css'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Plan {
  id:                 string
  name:               string
  slug:               string
  price_ngn:          number
  price_per_user_ngn: number
  billing_cycle:      string
  features:           string[]
  student_limit:      number
  is_active:          boolean
  is_popular:         boolean
  color:              string
  sort_order:         number
}

interface TrialConfig {
  id:           string
  default_days: number
  grace_hours:  number
}

interface InstallmentConfig {
  id:           string
  months:       number
  discount_pct: number
  is_active:    boolean
}

interface SetupFeeConfig {
  id:          string
  amount_ngn:  number
  is_required: boolean
  description: string
}

// ── API helpers — all writes go server-side ───────────────────────────────────

async function apiGet() {
  const res = await fetch('/api/super-admin/settings')
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<{
    plans:       Plan[]
    trial:       TrialConfig
    installment: InstallmentConfig
    setupFee:    SetupFeeConfig | null
  }>
}

async function apiPost(action: string, payload: unknown) {
  const res = await fetch('/api/super-admin/settings', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ action, payload }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? 'Unknown error')
  return json
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [plans,       setPlans]       = useState<Plan[]>([])
  const [trial,       setTrial]       = useState<TrialConfig | null>(null)
  const [installment, setInstallment] = useState<InstallmentConfig | null>(null)
  const [setupFee,    setSetupFee]    = useState<SetupFeeConfig | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [saving,      setSaving]      = useState(false)
  const [tab,         setTab]         = useState<'plans'|'trial'|'setup'|'installment'>('plans')
  const [editPlan,    setEditPlan]    = useState<Plan | null>(null)
  const [showAddPlan, setShowAddPlan] = useState(false)
  const [saved,       setSaved]       = useState('')
  const [saveError,   setSaveError]   = useState('')

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    try {
      const data = await apiGet()
      setPlans(data.plans ?? [])
      setTrial(data.trial)
      setInstallment(data.installment)
      setSetupFee(data.setupFee)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }

  async function saveTrial() {
    if (!trial) return
    setSaving(true)
    try {
      await apiPost('saveTrial', trial)
      flash('Trial settings saved ✓')
    } catch (err) {
      flashError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function saveInstallment() {
    if (!installment) return
    setSaving(true)
    try {
      await apiPost('saveInstallment', installment)
      flash('Installment settings saved ✓')
    } catch (err) {
      flashError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function saveSetupFee() {
    if (!setupFee) return
    setSaving(true)
    try {
      const res = await apiPost('saveSetupFee', setupFee)
      if (res.data) setSetupFee(res.data)   // capture newly-assigned id on first insert
      flash('Setup fee saved ✓')
    } catch (err) {
      flashError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function savePlan(plan: Plan) {
    setSaving(true)
    try {
      await apiPost('savePlan', plan)
      await loadAll()
      setEditPlan(null)
      setShowAddPlan(false)
      flash('Plan saved ✓')
    } catch (err) {
      flashError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function deletePlan(id: string) {
    if (!confirm('Delete this plan? Schools on this plan will not be affected.')) return
    try {
      await apiPost('deletePlan', { id })
      setPlans(prev => prev.filter(p => p.id !== id))
      flash('Plan deleted')
    } catch (err) {
      flashError(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  async function togglePlanActive(id: string, current: boolean) {
    const is_active = !current
    try {
      await apiPost('togglePlan', { id, is_active })
      setPlans(prev => prev.map(p => p.id === id ? { ...p, is_active } : p))
    } catch (err) {
      flashError(err instanceof Error ? err.message : 'Toggle failed')
    }
  }

  function flash(msg: string) {
    setSaved(msg)
    setSaveError('')
    setTimeout(() => setSaved(''), 3000)
  }

  function flashError(msg: string) {
    setSaveError(msg)
    setSaved('')
    setTimeout(() => setSaveError(''), 5000)
  }

  const TABS = [
    { id: 'plans',       label: '📦 Subscription Plans' },
    { id: 'setup',       label: '💰 Setup Fee' },
    { id: 'trial',       label: '⏳ Trial Config' },
    { id: 'installment', label: '📅 Installment' },
  ] as const

  const blankPlan: Plan = {
    id: 'new_' + Date.now(), name: '', slug: '',
    price_ngn: 500, price_per_user_ngn: 0,
    billing_cycle: 'monthly', features: [''],
    student_limit: 0, is_active: true, is_popular: false,
    color: '#7C3AED', sort_order: plans.length + 1,
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Subscription Settings</h1>
          <p className={styles.sub}>Customize all pricing, plans, trial, and fees</p>
        </div>
        {saved     && <span className={styles.savedBadge}>✓ {saved}</span>}
        {saveError && (
          <span className={styles.savedBadge} style={{ background:'var(--danger-subtle)', color:'var(--danger)', borderColor:'rgba(239,68,68,0.2)' }}>
            ⚠ {saveError}
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`${styles.tabBtn} ${tab===t.id ? styles.tabBtnActive : ''}`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? <div className={styles.loading}><span/><span/><span/></div> : <>

      {/* ── PLANS ───────────────────────────────────────────────── */}
      {tab === 'plans' && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <p className={styles.sectionTitle}>Subscription Plans</p>
            <button className={styles.addBtn} onClick={() => { setEditPlan(blankPlan); setShowAddPlan(true) }}>
              <PlusIcon size={14} color="white"/> New Plan
            </button>
          </div>
          <p className={styles.sectionDesc}>
            Set flat monthly prices and/or per-student pricing. Leave per-user at 0 for flat rate only.
          </p>

          <div className={styles.plansGrid}>
            {plans.map(plan => (
              editPlan?.id === plan.id
                ? <PlanEditor key={plan.id} plan={editPlan} onChange={setEditPlan}
                    onSave={() => savePlan(editPlan!)} onCancel={() => setEditPlan(null)} saving={saving}/>
                : <div key={plan.id} className={`${styles.planCard} ${!plan.is_active ? styles.planInactive : ''}`}
                    style={{ borderColor: plan.color + '40' }}>
                    <div className={styles.planCardTop} style={{ background: plan.color + '15' }}>
                      <div>
                        <p className={styles.planName}>{plan.name}</p>
                        {plan.is_popular && <span className={styles.popularBadge}>Most Popular</span>}
                      </div>
                      <div className={styles.planActions}>
                        <button className={styles.planActionBtn} onClick={() => setEditPlan(plan)}>
                          <EditIcon size={14}/>
                        </button>
                        <button className={styles.planActionBtn} style={{ color:'var(--danger)' }}
                          onClick={() => deletePlan(plan.id)}>
                          <TrashIcon size={14}/>
                        </button>
                      </div>
                    </div>
                    <div className={styles.planCardBody}>
                      <p className={styles.planPrice}>
                        ₦{plan.price_ngn.toLocaleString()}
                        <span className={styles.planPriceSub}>/{plan.billing_cycle}</span>
                      </p>
                      {plan.price_per_user_ngn > 0 && (
                        <p className={styles.perUserPrice}>
                          + ₦{plan.price_per_user_ngn}/student/month
                        </p>
                      )}
                      <p className={styles.planLimit}>
                        {plan.student_limit === 0 ? 'Unlimited students' : `Up to ${plan.student_limit} students`}
                      </p>
                      <div className={styles.featureList}>
                        {(plan.features ?? []).slice(0,4).map((f,i) => (
                          <div key={i} className={styles.featureItem}>
                            <CheckCircleIcon size={13} color="#10B981"/>
                            <span>{f}</span>
                          </div>
                        ))}
                        {(plan.features ?? []).length > 4 && (
                          <p className={styles.moreFeatures}>+{plan.features.length - 4} more</p>
                        )}
                      </div>
                      <button onClick={() => togglePlanActive(plan.id, plan.is_active)}
                        className={styles.toggleBtn}
                        style={{ background: plan.is_active ? 'var(--success-subtle)' : 'var(--danger-subtle)', color: plan.is_active ? 'var(--success)' : 'var(--danger)', borderColor: plan.is_active ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)' }}>
                        {plan.is_active ? '✅ Active' : '❌ Inactive'}
                      </button>
                    </div>
                  </div>
            ))}

            {showAddPlan && editPlan?.id.startsWith('new_') && (
              <PlanEditor plan={editPlan} onChange={setEditPlan}
                onSave={() => savePlan(editPlan!)} onCancel={() => { setEditPlan(null); setShowAddPlan(false) }} saving={saving}/>
            )}
          </div>
        </div>
      )}

      {/* ── SETUP FEE ───────────────────────────────────────────── */}
      {tab === 'setup' && (
        <div className={styles.section}>
          <p className={styles.sectionTitle}>One-Time Setup Fee</p>
          <p className={styles.sectionDesc}>
            Charged once when a school moves from trial to permanent. After payment, they get 1 free month.
          </p>
          <div className={styles.configCard}>
            <div className={styles.formGrid}>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Setup Fee Amount (₦)</label>
                <input type="number" min={0}
                  className={styles.fieldInput}
                  value={setupFee?.amount_ngn ?? 0}
                  onChange={e => setSetupFee(prev => prev
                    ? { ...prev, amount_ngn: +e.target.value }
                    : { id:'', amount_ngn:+e.target.value, is_required:true, description:'' }
                  )}
                  placeholder="e.g. 50000"/>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Required Before Activation?</label>
                <div className={styles.toggleRow}>
                  <button onClick={() => setSetupFee(prev => prev ? { ...prev, is_required:true } : null)}
                    className={`${styles.toggleOption} ${setupFee?.is_required ? styles.toggleOptionActive : ''}`}>
                    Yes — Required
                  </button>
                  <button onClick={() => setSetupFee(prev => prev ? { ...prev, is_required:false } : null)}
                    className={`${styles.toggleOption} ${!setupFee?.is_required ? styles.toggleOptionActive : ''}`}>
                    No — Optional
                  </button>
                </div>
              </div>
              <div className={styles.fieldGroupFull}>
                <label className={styles.fieldLabel}>Description shown to school</label>
                <input type="text"
                  className={styles.fieldInput}
                  value={setupFee?.description ?? ''}
                  onChange={e => setSetupFee(prev => prev ? { ...prev, description: e.target.value } : null)}
                  placeholder="e.g. One-time setup, configuration and onboarding fee"/>
              </div>
            </div>
            <button className={styles.saveBtn} onClick={saveSetupFee} disabled={saving}>
              {saving ? 'Saving...' : '💾 Save Setup Fee'}
            </button>
          </div>
        </div>
      )}

      {/* ── TRIAL CONFIG ────────────────────────────────────────── */}
      {tab === 'trial' && trial && (
        <div className={styles.section}>
          <p className={styles.sectionTitle}>Trial Configuration</p>
          <p className={styles.sectionDesc}>
            Controls how long schools get for free trial and grace period after expiry.
          </p>
          <div className={styles.configCard}>
            <div className={styles.formGrid}>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Default Trial Duration (days)</label>
                <input type="number" min={1} max={30}
                  className={styles.fieldInput}
                  value={trial.default_days}
                  onChange={e => setTrial(prev => prev ? { ...prev, default_days: +e.target.value } : null)}/>
                <p className={styles.fieldHint}>How many days a new school gets for free. You can still extend individually.</p>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Grace Period After Expiry (hours)</label>
                <input type="number" min={0} max={72}
                  className={styles.fieldInput}
                  value={trial.grace_hours}
                  onChange={e => setTrial(prev => prev ? { ...prev, grace_hours: +e.target.value } : null)}/>
                <p className={styles.fieldHint}>Extra hours of access after trial expires. Useful for late payments.</p>
              </div>
            </div>
            <div className={styles.previewBox}>
              <p style={{ fontWeight:700, marginBottom:6 }}>Preview</p>
              <p style={{ fontSize:'0.82rem', color:'var(--text-secondary)' }}>
                Trial → <strong>{trial.default_days} days</strong> full access →
                Auto-locked + <strong>{trial.grace_hours}h grace</strong> →
                School must pay setup fee → <strong>1 month free</strong> → subscription
              </p>
            </div>
            <button className={styles.saveBtn} onClick={saveTrial} disabled={saving}>
              {saving ? 'Saving...' : '💾 Save Trial Settings'}
            </button>
          </div>
        </div>
      )}

      {/* ── INSTALLMENT ─────────────────────────────────────────── */}
      {tab === 'installment' && installment && (
        <div className={styles.section}>
          <p className={styles.sectionTitle}>Installment Plan</p>
          <p className={styles.sectionDesc}>
            Allow schools to pay their subscription in installments instead of one lump sum.
          </p>
          <div className={styles.configCard}>
            <div className={styles.formGrid}>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Number of Installments</label>
                <input type="number" min={2} max={12}
                  className={styles.fieldInput}
                  value={installment.months}
                  onChange={e => setInstallment(prev => prev ? { ...prev, months: +e.target.value } : null)}/>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Discount/Surcharge (%)</label>
                <input type="number" min={-50} max={50} step={0.5}
                  className={styles.fieldInput}
                  value={installment.discount_pct}
                  onChange={e => setInstallment(prev => prev ? { ...prev, discount_pct: +e.target.value } : null)}/>
                <p className={styles.fieldHint}>Negative = discount. Positive = surcharge for installment.</p>
              </div>
              <div className={styles.fieldGroupFull}>
                <label className={styles.fieldLabel}>Enable Installment Option?</label>
                <div className={styles.toggleRow}>
                  <button onClick={() => setInstallment(prev => prev ? { ...prev, is_active:true } : null)}
                    className={`${styles.toggleOption} ${installment.is_active ? styles.toggleOptionActive : ''}`}>
                    ✅ Enabled
                  </button>
                  <button onClick={() => setInstallment(prev => prev ? { ...prev, is_active:false } : null)}
                    className={`${styles.toggleOption} ${!installment.is_active ? styles.toggleOptionActive : ''}`}>
                    ❌ Disabled
                  </button>
                </div>
              </div>
            </div>
            <button className={styles.saveBtn} onClick={saveInstallment} disabled={saving}>
              {saving ? 'Saving...' : '💾 Save Installment Settings'}
            </button>
          </div>
        </div>
      )}

      </>}
    </div>
  )
}

// ── Plan Editor Component ─────────────────────────────────────────────────────

function PlanEditor({ plan, onChange, onSave, onCancel, saving }: {
  plan: Plan; onChange: (p: Plan) => void
  onSave: () => void; onCancel: () => void; saving: boolean
}) {
  function updateFeature(i: number, val: string) {
    const features = [...plan.features]
    features[i] = val
    onChange({ ...plan, features })
  }
  function addFeature()        { onChange({ ...plan, features: [...plan.features, ''] }) }
  function removeFeature(i: number) {
    onChange({ ...plan, features: plan.features.filter((_, idx) => idx !== i) })
  }

  return (
    <div className={styles.planEditor}>
      <h3 className={styles.editorTitle}>{plan.id.startsWith('new_') ? 'New Plan' : `Edit: ${plan.name}`}</h3>
      <div className={styles.editorGrid}>
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>Plan Name *</label>
          <input className={styles.fieldInput} value={plan.name}
            onChange={e => onChange({ ...plan, name: e.target.value })} placeholder="e.g. Standard"/>
        </div>
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>Flat Price / Month (₦)</label>
          <input type="number" min={0} className={styles.fieldInput} value={plan.price_ngn}
            onChange={e => onChange({ ...plan, price_ngn: +e.target.value })}/>
        </div>
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>Per-Student Price / Month (₦)</label>
          <input type="number" min={0} className={styles.fieldInput} value={plan.price_per_user_ngn}
            onChange={e => onChange({ ...plan, price_per_user_ngn: +e.target.value })}
            placeholder="0 = flat rate only"/>
          <p className={styles.fieldHint}>Total = flat + (per-student × student count)</p>
        </div>
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>Student Limit</label>
          <input type="number" min={0} className={styles.fieldInput} value={plan.student_limit}
            onChange={e => onChange({ ...plan, student_limit: +e.target.value })}
            placeholder="0 = unlimited"/>
        </div>
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>Billing Cycle</label>
          <select className={styles.fieldInput} value={plan.billing_cycle}
            onChange={e => onChange({ ...plan, billing_cycle: e.target.value })}>
            <option value="monthly">Monthly</option>
            <option value="termly">Per Term (3 months)</option>
            <option value="annual">Annual</option>
          </select>
        </div>
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>Accent Color</label>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <input type="color" value={plan.color}
              onChange={e => onChange({ ...plan, color: e.target.value })}
              style={{ width:44, height:38, borderRadius:8, border:'1px solid var(--glass-border)', cursor:'pointer', padding:2 }}/>
            <input className={styles.fieldInput} value={plan.color}
              onChange={e => onChange({ ...plan, color: e.target.value })}/>
          </div>
        </div>
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>Show as "Most Popular"?</label>
          <div className={styles.toggleRow}>
            {([true, false] as const).map(v => (
              <button key={String(v)} onClick={() => onChange({ ...plan, is_popular: v })}
                className={`${styles.toggleOption} ${plan.is_popular === v ? styles.toggleOptionActive : ''}`}>
                {v ? '⭐ Yes' : 'No'}
              </button>
            ))}
          </div>
        </div>
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>Sort Order</label>
          <input type="number" min={1} className={styles.fieldInput} value={plan.sort_order}
            onChange={e => onChange({ ...plan, sort_order: +e.target.value })}/>
        </div>
      </div>

      {/* Features */}
      <div style={{ marginTop:'var(--space-4)' }}>
        <label className={styles.fieldLabel}>Features (shown on plan card)</label>
        {plan.features.map((f, i) => (
          <div key={i} style={{ display:'flex', gap:6, marginBottom:6 }}>
            <input className={styles.fieldInput} value={f}
              onChange={e => updateFeature(i, e.target.value)}
              placeholder={`Feature ${i+1}`}/>
            <button onClick={() => removeFeature(i)}
              style={{ width:36, height:40, background:'var(--danger-subtle)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:8, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <TrashIcon size={13} color="var(--danger)"/>
            </button>
          </div>
        ))}
        <button onClick={addFeature}
          style={{ display:'flex', alignItems:'center', gap:5, padding:'6px 12px', background:'var(--glass-bg)', border:'1px solid var(--glass-border)', borderRadius:8, color:'var(--text-muted)', fontSize:'0.78rem', fontWeight:600, cursor:'pointer', marginTop:4 }}>
          <PlusIcon size={13}/> Add Feature
        </button>
      </div>

      <div style={{ display:'flex', gap:'var(--space-3)', marginTop:'var(--space-5)' }}>
        <button className={styles.saveBtn} onClick={onSave} disabled={saving || !plan.name} style={{ flex:1 }}>
          {saving ? 'Saving...' : '💾 Save Plan'}
        </button>
        <button onClick={onCancel}
          style={{ flex:1, height:42, background:'var(--glass-bg)', border:'1px solid var(--glass-border)', borderRadius:8, color:'var(--text-muted)', fontWeight:600, fontSize:'0.875rem', cursor:'pointer' }}>
          Cancel
        </button>
      </div>
    </div>
  )
}
