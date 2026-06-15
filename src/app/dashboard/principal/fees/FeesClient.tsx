'use client'
// src/app/dashboard/principal/fees/FeesClient.tsx
// FIX: now reads from school_fees (same table as bursar) with term/year filtering
// Principal gets a read-only view — bursar manages the actual records.

import { useState, useEffect } from 'react'
import { createClient }        from '@/lib/supabase/client'
import RolePageWrapper         from '@/components/RolePageWrapper'
import { WalletIcon }          from '@/components/Icons'
import styles                  from '@/app/dashboard/student/records/page.module.css'

interface Props { profile: any; school: any; userId: string }

const TERMS    = ['First Term', 'Second Term', 'Third Term']
const CUR_YEAR = new Date().getMonth() >= 8
  ? `${new Date().getFullYear()}/${new Date().getFullYear() + 1}`
  : `${new Date().getFullYear() - 1}/${new Date().getFullYear()}`

function fmtAmt(n: number) {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency', currency: 'NGN', minimumFractionDigits: 0,
  }).format(n)
}

export default function FeesClient({ profile, school, userId }: Props) {
  const [rows,    setRows]    = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [term,    setTerm]    = useState('First Term')
  const [year,    setYear]    = useState(CUR_YEAR)
  const supabase = createClient()
  const sc       = school?.primary_color ?? '#7C3AED'

  // Re-fetch whenever term or year changes
  useEffect(() => { load() }, [term, year])

  async function load() {
    if (!school?.id) { setLoading(false); return }
    setLoading(true)
    const { data } = await supabase
      .from('school_fees')
      .select('id, class_level, fee_type, amount, description, term, academic_year, created_at')
      .eq('school_id', school.id)
      .eq('term', term)
      .eq('academic_year', year)
      .order('class_level')
    setRows(data ?? [])
    setLoading(false)
  }

  const totalExpected = rows.reduce((s, r) => s + (r.amount ?? 0), 0)

  // Group rows by class_level so the principal can see per-class breakdown
  const grouped: Record<string, any[]> = {}
  for (const r of rows) {
    const key = r.class_level ?? 'Other'
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(r)
  }

  return (
    <RolePageWrapper userId={userId} role="principal" profile={profile} school={school} title="Fee Structures">

      {/* ── Year + Term selector ── */}
      <div style={{
        display: 'flex', gap: 'var(--space-3)', alignItems: 'center',
        padding: '0 var(--space-5) var(--space-4)',
        flexWrap: 'wrap',
      }}>
        <input
          value={year}
          onChange={e => setYear(e.target.value)}
          placeholder="2024/2025"
          style={{
            width: 110, height: 38, padding: '0 10px', flexShrink: 0,
            background: 'var(--input-bg)', border: '1px solid var(--input-border)',
            borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.8rem', outline: 'none',
          }}
        />
        <div style={{ display: 'flex', gap: 6, flex: 1, flexWrap: 'wrap' }}>
          {TERMS.map(t => (
            <button
              key={t}
              onClick={() => setTerm(t)}
              style={{
                padding: '6px 14px', borderRadius: 999, fontSize: '0.78rem', fontWeight: 700,
                cursor: 'pointer', transition: 'all 0.15s',
                background:   term === t ? sc        : 'var(--glass-bg)',
                color:        term === t ? '#fff'    : 'var(--text-muted)',
                border:       term === t ? `1px solid ${sc}` : '1px solid var(--glass-border)',
              }}
            >
              {t.replace(' Term', '')}
            </button>
          ))}
        </div>
      </div>

      {/* ── Total banner ── */}
      {!loading && rows.length > 0 && (
        <div style={{
          margin: '0 var(--space-5) var(--space-4)',
          padding: 'var(--space-4)',
          background: sc + '15', border: `1px solid ${sc}30`,
          borderRadius: 10,
        }}>
          <p style={{
            fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)',
            letterSpacing: '0.05em', margin: '0 0 4px', textTransform: 'uppercase',
          }}>
            Total per student — {term} {year}
          </p>
          <p style={{ fontSize: '1.2rem', fontWeight: 800, color: sc, margin: 0 }}>
            {fmtAmt(totalExpected)}
          </p>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>
            {rows.length} fee line{rows.length !== 1 ? 's' : ''} across {Object.keys(grouped).length} class level{Object.keys(grouped).length !== 1 ? 's' : ''}
            &nbsp;· Read-only view — edit in Bursar dashboard
          </p>
        </div>
      )}

      {/* ── Content ── */}
      {loading ? (
        <div className={styles.loading}><span/><span/><span/></div>
      ) : rows.length === 0 ? (
        <div className={styles.empty}>
          <WalletIcon size={40} color="var(--text-faint)" strokeWidth={1}/>
          <p>No fee structures for {term} {year}</p>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: -8 }}>
            Ask the bursar to set up fee structures in their dashboard.
          </p>
        </div>
      ) : (
        <div style={{ padding: '0 var(--space-5)' }}>
          {Object.entries(grouped).map(([classLevel, items]) => (
            <div key={classLevel} style={{ marginBottom: 'var(--space-5)' }}>
              {/* Class level header */}
              <p style={{
                fontSize: '0.7rem', fontWeight: 800, color: sc,
                textTransform: 'uppercase', letterSpacing: '0.07em',
                marginBottom: 'var(--space-2)', paddingLeft: 2,
              }}>
                {classLevel}
              </p>

              {/* Fee rows for this class */}
              <div className={styles.list}>
                {items.map((item: any) => (
                  <div key={item.id} className={styles.card}>
                    <div className={styles.cardIcon} style={{ background: sc + '20' }}>
                      <WalletIcon size={16} color={sc}/>
                    </div>
                    <div className={styles.cardBody}>
                      <p className={styles.cardTitle} style={{ textTransform: 'capitalize' }}>
                        {item.fee_type?.replace(/_/g, ' ') ?? 'School Fees'}
                      </p>
                      {item.description && (
                        <p className={styles.cardMeta}>{item.description}</p>
                      )}
                    </div>
                    <span style={{
                      fontSize: '0.92rem', fontWeight: 800,
                      color: sc, flexShrink: 0,
                    }}>
                      {fmtAmt(item.amount ?? 0)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Class sub-total */}
              <div style={{
                display: 'flex', justifyContent: 'flex-end',
                padding: 'var(--space-2) 0', marginTop: 'var(--space-1)',
                borderTop: '1px solid var(--glass-border)',
              }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginRight: 8 }}>
                  Class total:
                </span>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {fmtAmt(items.reduce((s: number, r: any) => s + (r.amount ?? 0), 0))}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className={styles.spacer}/>
    </RolePageWrapper>
  )
                               }
      
