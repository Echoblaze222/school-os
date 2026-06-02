'use client'

import { useState } from 'react'
import { SchoolIcon, ClockIcon, CheckCircleIcon } from '@/components/Icons'
import styles from './school-setup-modal.module.css'

interface Props {
  onClose:   () => void
  onSuccess: () => void
}

type SetupType = 'trial' | 'permanent'

export default function SchoolSetupModal({ onClose, onSuccess }: Props) {
  const [step,        setStep]        = useState(1)
  const [setupType,   setSetupType]   = useState<SetupType>('trial')
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')
  const [credentials, setCredentials] = useState<{ defaultCode: string; tempPassword: string; email: string } | null>(null)

  const [form, setForm] = useState({
    schoolName:      '',
    address:         '',
    phone:           '',
    email:           '',
    primaryColor:    '#7C3AED',
    principalName:   '',
    principalEmail:  '',
    principalPhone:  '',
    notes:           '',
    trialDays:       10,
    subscriptionPlan: 'basic_500' as string,
    paymentAmount:   0,
    paymentRef:      '',
  })

  function update(field: string, value: any) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit() {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/super-admin/create-school', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolName:       form.schoolName,
          address:          form.address,
          phone:            form.phone,
          email:            form.email,
          primaryColor:     form.primaryColor,
          principalName:    form.principalName,
          principalEmail:   form.principalEmail,
          principalPhone:   form.principalPhone,
          notes:            form.notes,
          trialDays:        form.trialDays,
          setupType,
          paymentAmount:    form.paymentAmount,
          paymentRef:       form.paymentRef,
        }),
      })

      const json = await res.json()
      if (!json.ok) throw new Error(json.error ?? 'Server error')

      setCredentials({
        defaultCode:  json.principal.defaultCode,
        tempPassword: json.principal.tempPassword,
        email:        json.principal.email,
      })
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong. Try again.')
    }
    setLoading(false)
  }

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        {/* Header */}
        <div className={styles.modalHeader}>
          <div className={styles.modalTitle}>
            <SchoolIcon size={20} color="var(--brand-light)" />
            <h2>Add New School</h2>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* ── SUCCESS: show credentials ── */}
        {credentials && (
          <div className={styles.body}>
            <div className={styles.stepContent} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
              <h3 style={{ color: '#10B981', marginBottom: 4 }}>School Activated!</h3>
              <p className={styles.stepDesc} style={{ marginBottom: 24 }}>
                A welcome email has been sent to <strong>{credentials.email}</strong>.<br />
                Save these credentials — share them with the principal if needed.
              </p>

              <div className={styles.confirmCard} style={{ textAlign: 'left' }}>
                <div className={styles.confirmRow}>
                  <span>Principal Email</span>
                  <strong style={{ fontFamily: 'monospace' }}>{credentials.email}</strong>
                </div>
                <div className={styles.confirmRow}>
                  <span>Access Code</span>
                  <strong style={{ fontFamily: 'monospace', color: '#a78bfa', fontSize: 18 }}>
                    {credentials.defaultCode}
                  </strong>
                </div>
                <div className={styles.confirmRow}>
                  <span>Temp Password</span>
                  <strong style={{ fontFamily: 'monospace', color: '#f59e0b', fontSize: 18 }}>
                    {credentials.tempPassword}
                  </strong>
                </div>
              </div>

              <p style={{ color: '#6b7280', fontSize: 13, marginTop: 16 }}>
                The principal will be prompted to set a new PIN and password on first login.
              </p>
            </div>

            <div className={styles.footer}>
              <div style={{ flex: 1 }} />
              <button className={styles.submitBtn} onClick={onSuccess}>
                Done ✓
              </button>
            </div>
          </div>
        )}

        {/* ── NORMAL FLOW ── */}
        {!credentials && (<>

        {/* Step indicator */}
        <div className={styles.stepIndicator}>
          {['Setup Type', 'School Info', 'Principal', 'Confirm'].map((label, i) => (
            <div key={label} className={`${styles.stepDot} ${step > i ? styles.stepDone : ''} ${step === i + 1 ? styles.stepCurrent : ''}`}>
              <span>{i + 1}</span>
              <p>{label}</p>
            </div>
          ))}
        </div>

        <div className={styles.body}>
          {/* STEP 1: Choose setup type */}
          {step === 1 && (
            <div className={styles.stepContent}>
              <h3>Choose Setup Type</h3>
              <p className={styles.stepDesc}>How are you activating this school?</p>

              <div className={styles.typeCards}>
                <button
                  className={`${styles.typeCard} ${setupType === 'trial' ? styles.typeCardActive : ''}`}
                  onClick={() => setSetupType('trial')}
                >
                  <div className={styles.typeIcon} style={{ background: 'rgba(245,158,11,0.15)' }}>
                    <ClockIcon size={24} color="#F59E0B" />
                  </div>
                  <div className={styles.typeInfo}>
                    <p className={styles.typeTitle}>Free Trial</p>
                    <p className={styles.typeSub}>
                      School gets {form.trialDays} days of full access. No payment required.
                      Converts to permanent if they pay within trial period.
                    </p>
                    <div className={styles.typeBadge} style={{ background: 'rgba(245,158,11,0.1)', color: '#F59E0B', borderColor: 'rgba(245,158,11,0.2)' }}>
                      FREE · {form.trialDays} days
                    </div>
                  </div>
                  {setupType === 'trial' && <div className={styles.typeCheck}>✓</div>}
                </button>

                <button
                  className={`${styles.typeCard} ${setupType === 'permanent' ? styles.typeCardActive : ''}`}
                  onClick={() => setSetupType('permanent')}
                >
                  <div className={styles.typeIcon} style={{ background: 'rgba(16,185,129,0.15)' }}>
                    <CheckCircleIcon size={24} color="#10B981" />
                  </div>
                  <div className={styles.typeInfo}>
                    <p className={styles.typeTitle}>Permanent Setup</p>
                    <p className={styles.typeSub}>
                      School has paid the setup fee. Gets 1 month FREE access,
                      then subscription starts.
                    </p>
                    <div className={styles.typeBadge} style={{ background: 'rgba(16,185,129,0.1)', color: '#10B981', borderColor: 'rgba(16,185,129,0.2)' }}>
                      PAID · 1 month free
                    </div>
                  </div>
                  {setupType === 'permanent' && <div className={styles.typeCheck}>✓</div>}
                </button>
              </div>

              {setupType === 'trial' && (
                <div className={styles.trialDaysRow}>
                  <label className={styles.label}>Trial duration (days)</label>
                  <input type="number" min={1} max={30}
                    className={styles.input} style={{ maxWidth: 100 }}
                    value={form.trialDays}
                    onChange={e => update('trialDays', parseInt(e.target.value))} />
                </div>
              )}

              {setupType === 'permanent' && (
                <div className={styles.paymentRow}>
                  <div>
                    <label className={styles.label}>Setup fee paid (₦)</label>
                    <input type="number" className={styles.input}
                      value={form.paymentAmount} onChange={e => update('paymentAmount', +e.target.value)}
                      placeholder="e.g. 50000" />
                  </div>
                  <div>
                    <label className={styles.label}>Payment reference</label>
                    <input type="text" className={styles.input}
                      value={form.paymentRef} onChange={e => update('paymentRef', e.target.value)}
                      placeholder="Paystack/bank ref" />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 2: School info */}
          {step === 2 && (
            <div className={styles.stepContent}>
              <h3>School Information</h3>
              <div className={styles.formGrid}>
                <div className={styles.fieldFull}>
                  <label className={styles.label}>School Name *</label>
                  <input className={styles.input} value={form.schoolName}
                    onChange={e => update('schoolName', e.target.value)}
                    placeholder="e.g. Greenfield Academy" autoFocus />
                </div>
                <div className={styles.fieldFull}>
                  <label className={styles.label}>Address</label>
                  <input className={styles.input} value={form.address}
                    onChange={e => update('address', e.target.value)}
                    placeholder="School address" />
                </div>
                <div>
                  <label className={styles.label}>Phone</label>
                  <input className={styles.input} value={form.phone}
                    onChange={e => update('phone', e.target.value)}
                    placeholder="08012345678" />
                </div>
                <div>
                  <label className={styles.label}>Email</label>
                  <input className={styles.input} type="email" value={form.email}
                    onChange={e => update('email', e.target.value)}
                    placeholder="school@email.com" />
                </div>
                <div>
                  <label className={styles.label}>Brand Color</label>
                  <div className={styles.colorRow}>
                    <input type="color" className={styles.colorPicker}
                      value={form.primaryColor}
                      onChange={e => update('primaryColor', e.target.value)} />
                    <input className={styles.input} value={form.primaryColor}
                      onChange={e => update('primaryColor', e.target.value)}
                      placeholder="#7C3AED" />
                  </div>
                </div>
                <div className={styles.fieldFull}>
                  <label className={styles.label}>Private Notes (only you see this)</label>
                  <textarea className={`${styles.input} ${styles.textarea}`}
                    value={form.notes} onChange={e => update('notes', e.target.value)}
                    placeholder="e.g. Called on 12 May, contact is Mr. Adeyemi" />
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Principal */}
          {step === 3 && (
            <div className={styles.stepContent}>
              <h3>Principal / Admin Account</h3>
              <p className={styles.stepDesc}>This person will be the school's main admin.</p>
              <div className={styles.formGrid}>
                <div className={styles.fieldFull}>
                  <label className={styles.label}>Full Name *</label>
                  <input className={styles.input} value={form.principalName}
                    onChange={e => update('principalName', e.target.value)}
                    placeholder="e.g. Mr. Adeyemi Chukwu" autoFocus />
                </div>
                <div>
                  <label className={styles.label}>Email Address *</label>
                  <input className={styles.input} type="email" value={form.principalEmail}
                    onChange={e => update('principalEmail', e.target.value)}
                    placeholder="principal@school.com" />
                </div>
                <div>
                  <label className={styles.label}>Phone Number</label>
                  <input className={styles.input} value={form.principalPhone}
                    onChange={e => update('principalPhone', e.target.value)}
                    placeholder="08012345678" />
                </div>
              </div>
              <div className={styles.infoBox}>
                ℹ️ A temporary password will be auto-generated and sent to the principal's notifications.
                They will be prompted to change it on first login.
              </div>
            </div>
          )}

          {/* STEP 4: Confirm */}
          {step === 4 && (
            <div className={styles.stepContent}>
              <h3>Confirm Setup</h3>
              <div className={styles.confirmCard}>
                <div className={styles.confirmRow}><span>School</span><strong>{form.schoolName}</strong></div>
                <div className={styles.confirmRow}><span>Setup Type</span>
                  <strong style={{ color: setupType === 'trial' ? '#F59E0B' : '#10B981' }}>
                    {setupType === 'trial' ? `🔥 Free Trial (${form.trialDays} days)` : '✅ Permanent Setup'}
                  </strong>
                </div>
                {setupType === 'permanent' && (
                  <div className={styles.confirmRow}><span>Amount Paid</span><strong>₦{form.paymentAmount.toLocaleString()}</strong></div>
                )}
                <div className={styles.confirmRow}><span>Principal</span><strong>{form.principalName}</strong></div>
                <div className={styles.confirmRow}><span>Email</span><strong>{form.principalEmail}</strong></div>
                <div className={styles.confirmRow}><span>Free Access</span>
                  <strong>{setupType === 'trial' ? `${form.trialDays} days` : '1 month'}</strong>
                </div>
              </div>
              {error && <p className={styles.error}>{error}</p>}
            </div>
          )}
        </div>

        {/* Footer buttons */}
        <div className={styles.footer}>
          {step > 1 && (
            <button className={styles.backBtn} onClick={() => setStep(s => s - 1)}>
              ← Back
            </button>
          )}
          <div style={{ flex: 1 }} />
          {step < 4
            ? <button className={styles.nextBtn}
                disabled={
                  (step === 2 && !form.schoolName) ||
                  (step === 3 && (!form.principalName || !form.principalEmail))
                }
                onClick={() => setStep(s => s + 1)}>
                Continue →
              </button>
            : <button className={styles.submitBtn} onClick={handleSubmit} disabled={loading}>
                {loading ? <span className={styles.spinner} /> : '🚀 Activate School'}
              </button>
          }
        </div>
        </>)}
      </div>
    </div>
  )
}