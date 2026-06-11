'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { PlusIcon, TrashIcon, EditIcon } from '@/components/Icons'
import styles from '@/app/dashboard/student/records/page.module.css'

interface Props { profile: any; school: any; userId: string }

const TERMS    = ['First Term', 'Second Term', 'Third Term']
const CATS     = ['salary','maintenance','stationery','exam','utilities','transport','other']
const CUR_YEAR = new Date().getMonth() >= 8
  ? `${new Date().getFullYear()}/${new Date().getFullYear()+1}`
  : `${new Date().getFullYear()-1}/${new Date().getFullYear()}`

const BLANK = { title:'', category:'other', amount:'', description:'', paid_at:'' }

export default function ExpensesClient({ profile, school, userId }: Props) {
  const [rows,     setRows]     = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [deleting, setDeleting] = useState<string|null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editId,   setEditId]   = useState<string|null>(null)
  const [form,     setForm]     = useState({ ...BLANK })
  const [term,     setTerm]     = useState('First Term')
  const [year,     setYear]     = useState(CUR_YEAR)
  const supabase = createClient()
  const sc = school?.primary_color ?? '#7C3AED'

  useEffect(() => { load() }, [term, year])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('school_expenses').select('*')
      .eq('school_id', school?.id).eq('term', term).eq('academic_year', year)
      .order('created_at', { ascending: false })
    if (data) setRows(data)
    setLoading(false)
  }

  function openCreate() {
    setEditId(null); setForm({ ...BLANK }); setShowForm(true)
  }

  function openEdit(item: any) {
    setEditId(item.id)
    setForm({
      title:       item.title ?? '',
      category:    item.category ?? 'other',
      amount:      String(item.amount ?? ''),
      description: item.description ?? '',
      paid_at:     item.paid_at ? item.paid_at.slice(0,10) : '',
    })
    setShowForm(true)
  }

  async function submit() {
    if (!form.title || !form.amount) return
    setSaving(true)
    const payload = {
      title:        form.title,
      category:     form.category,
      amount:       parseFloat(form.amount),
      description:  form.description || null,
      paid_at:      form.paid_at || null,
      school_id:    school.id,
      created_by:   userId,
      term,
      academic_year: year,
    }
    if (editId) {
      await supabase.from('school_expenses').update(payload).eq('id', editId)
    } else {
      await supabase.from('school_expenses').insert(payload)
    }
    setShowForm(false); setSaving(false); setEditId(null); setForm({ ...BLANK })
    load()
  }

  async function del(id: string) {
    setDeleting(id)
    await supabase.from('school_expenses').delete().eq('id', id)
    setDeleting(null); load()
  }

  function fmt(n: number) {
    return new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN',minimumFractionDigits:0}).format(n)
  }

  const totalSpend = rows.reduce((s, r) => s + (r.amount ?? 0), 0)

  const inp: React.CSSProperties = {
    width:'100%', height:42, padding:'0 12px',
    background:'var(--input-bg)', border:'1px solid var(--input-border)',
    borderRadius:8, color:'var(--text-primary)', fontSize:'0.85rem', outline:'none'
  }

  return (
    <RolePageWrapper userId={userId} role="bursar" profile={profile} school={school} title="Expenses">

      {/* Year + Term */}
      <div style={{ display:'flex', gap:'var(--space-3)', marginBottom:'var(--space-4)', alignItems:'center' }}>
        <input value={year} onChange={e => setYear(e.target.value)} placeholder="2024/2025"
          style={{ ...inp, width:110, flex:'none' }}/>
        <div className={styles.tabs} style={{ flex:1 }}>
          {TERMS.map(t => (
            <button key={t} onClick={() => setTerm(t)}
              className={`${styles.tab} ${term===t ? styles.tabActive : ''}`}
              style={term===t ? { background:sc, color:'#fff', borderColor:sc } : {}}>
              {t.replace(' Term','')}
            </button>
          ))}
        </div>
        {!showForm && (
          <button onClick={openCreate}
            style={{ display:'flex', alignItems:'center', gap:6, height:36, padding:'0 14px',
              background:sc, color:'#fff', border:'none', borderRadius:8,
              fontWeight:700, fontSize:'0.8rem', cursor:'pointer', flexShrink:0 }}>
            <PlusIcon size={14} color="#fff"/> Add
          </button>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <div style={{ background:'var(--glass-bg)', border:'1px solid var(--glass-border)',
          borderRadius:'var(--radius-xl)', padding:'var(--space-5)', marginBottom:'var(--space-5)' }}>
          <p style={{ fontSize:'0.85rem', fontWeight:800, color:'var(--text-primary)', margin:'0 0 var(--space-4)' }}>
            {editId ? 'Edit Expense' : 'New Expense'} — {term} {year}
          </p>
          <div style={{ display:'grid', gap:'var(--space-3)' }}>
            <input placeholder="Title *" value={form.title}
              onChange={e => setForm(p => ({...p, title:e.target.value}))} style={inp}/>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'var(--space-3)' }}>
              <select value={form.category}
                onChange={e => setForm(p => ({...p, category:e.target.value}))} style={inp}>
                {CATS.map(c => (
                  <option key={c} value={c} style={{ textTransform:'capitalize' }}>
                    {c.charAt(0).toUpperCase() + c.slice(1)}
                  </option>
                ))}
              </select>
              <input type="number" placeholder="Amount (₦) *" value={form.amount}
                onChange={e => setForm(p => ({...p, amount:e.target.value}))} style={inp}/>
            </div>
            <input placeholder="Description (optional)" value={form.description}
              onChange={e => setForm(p => ({...p, description:e.target.value}))} style={inp}/>
            <div>
              <label style={{ fontSize:'0.72rem', color:'var(--text-muted)', fontWeight:700,
                letterSpacing:'0.05em', display:'block', marginBottom:6 }}>DATE PAID (optional)</label>
              <input type="date" value={form.paid_at}
                onChange={e => setForm(p => ({...p, paid_at:e.target.value}))} style={inp}/>
            </div>
          </div>
          <div style={{ display:'flex', gap:'var(--space-3)', marginTop:'var(--space-4)' }}>
            <button onClick={submit} disabled={saving || !form.title || !form.amount}
              style={{ flex:1, height:42, background:sc, color:'#fff', border:'none', borderRadius:8,
                fontWeight:700, fontSize:'0.85rem', cursor:'pointer',
                opacity:(saving || !form.title || !form.amount) ? 0.5 : 1 }}>
              {saving ? 'Saving…' : editId ? 'Update' : 'Save Expense'}
            </button>
            <button onClick={() => { setShowForm(false); setEditId(null) }}
              style={{ padding:'0 20px', height:42, background:'var(--input-bg)',
                color:'var(--text-muted)', border:'1px solid var(--input-border)',
                borderRadius:8, fontWeight:700, cursor:'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Total banner */}
      {!loading && rows.length > 0 && (
        <div style={{ padding:'var(--space-4)', background:'#EF444415',
          border:'1px solid #EF444430', borderRadius:10, marginBottom:'var(--space-4)' }}>
          <p style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--text-muted)',
            letterSpacing:'0.05em', margin:'0 0 4px' }}>
            TOTAL EXPENSES — {term} {year}
          </p>
          <p style={{ fontSize:'1.2rem', fontWeight:800, color:'#EF4444', margin:0 }}>
            {fmt(totalSpend)}
          </p>
        </div>
      )}

      {loading
        ? <div className={styles.loading}><span/><span/><span/></div>
        : rows.length === 0
          ? <div className={styles.empty}>
              <p>No expenses recorded for {term} {year}</p>
            </div>
          : <div className={styles.list}>
              {rows.map((item: any) => (
                <div key={item.id} className={styles.card}>
                  <div className={styles.cardIcon} style={{ background:'#EF444420' }}>
                    <span style={{ fontSize:'0.8rem' }}>₦</span>
                  </div>
                  <div className={styles.cardBody}>
                    <p className={styles.cardTitle}>{item.title}</p>
                    <p className={styles.cardMeta} style={{ textTransform:'capitalize' }}>
                      {item.category}
                      {item.description ? ` · ${item.description}` : ''}
                      {item.paid_at ? ` · ${new Date(item.paid_at).toLocaleDateString('en-NG',{day:'numeric',month:'short',year:'numeric'})}` : ''}
                    </p>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
                    <span style={{ fontSize:'0.9rem', fontWeight:800, color:'#EF4444' }}>
                      {fmt(item.amount)}
                    </span>
                    <button onClick={() => openEdit(item)}
                      style={{ background:'#3B82F620', border:'none', borderRadius:6,
                        padding:'5px 8px', cursor:'pointer', display:'flex', alignItems:'center' }}>
                      <EditIcon size={13} color="#3B82F6"/>
                    </button>
                    <button onClick={() => del(item.id)} disabled={deleting===item.id}
                      style={{ background:'#EF444420', border:'none', borderRadius:6,
                        padding:'5px 8px', cursor:'pointer', display:'flex', alignItems:'center',
                        opacity:deleting===item.id ? 0.5 : 1 }}>
                      <TrashIcon size={13} color="#EF4444"/>
                    </button>
                  </div>
                </div>
              ))}
            </div>
      }
      <div className={styles.spacer}/>
    </RolePageWrapper>
  )
}