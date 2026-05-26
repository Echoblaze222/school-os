'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { SearchIcon, PlusIcon, FlameIcon, CheckCircleIcon, ClockIcon, SchoolIcon } from '@/components/Icons'
import SchoolCard from '../SchoolCard'
import SchoolSetupModal from '../SchoolSetupModal'
import styles from '../super-admin.module.css'

interface Props { schools: any[] }

const STATUS_TABS = [
  { value: 'all',       label: 'All'       },
  { value: 'trial',     label: '🔥 Trial'  },
  { value: 'active',    label: '✅ Active'  },
  { value: 'expired',   label: '❌ Expired' },
  { value: 'suspended', label: '⏸ Suspended'},
]

export default function SchoolsPageClient({ schools: initial }: Props) {
  const [schools,    setSchools]    = useState(initial)
  const [search,     setSearch]     = useState('')
  const [status,     setStatus]     = useState('all')
  const [showSetup,  setShowSetup]  = useState(false)

  const filtered = schools.filter(s => {
    const matchSearch = !search || s.name.toLowerCase().includes(search.toLowerCase())
    const matchStatus = status === 'all' || s.setup_status === status
    return matchSearch && matchStatus
  })

  const counts = {
    all:       schools.length,
    trial:     schools.filter(s => s.setup_status === 'trial').length,
    active:    schools.filter(s => s.setup_status === 'active').length,
    expired:   schools.filter(s => s.setup_status === 'expired').length,
    suspended: schools.filter(s => s.setup_status === 'suspended').length,
  }

  return (
    <div style={{ padding:'var(--space-8)', maxWidth:1100, margin:'0 auto' }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'var(--space-7)', gap:'var(--space-4)', flexWrap:'wrap' }}>
        <div>
          <h1 style={{ fontSize:'1.5rem', fontWeight:800, color:'var(--text-primary)', margin:'0 0 4px', letterSpacing:'-0.02em' }}>
            All Schools
          </h1>
          <p style={{ fontSize:'0.82rem', color:'var(--text-muted)', margin:0 }}>
            {schools.length} schools registered on SchoolOS
          </p>
        </div>
        <button className={styles.addSchoolBtn} onClick={() => setShowSetup(true)}>
          <PlusIcon size={15} color="white"/> Add School
        </button>
      </div>

      {/* Stats row */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:'var(--space-3)', marginBottom:'var(--space-6)' }}>
        {[
          { label:'Total',     value:counts.all,       color:'#7C3AED' },
          { label:'Trial',     value:counts.trial,     color:'#F59E0B' },
          { label:'Active',    value:counts.active,    color:'#10B981' },
          { label:'Expired',   value:counts.expired,   color:'#EF4444' },
          { label:'Suspended', value:counts.suspended, color:'#6B7280' },
        ].map(s => (
          <div key={s.label} style={{ background:'var(--glass-bg)', border:'1px solid var(--glass-border)', borderRadius:'var(--radius-xl)', padding:'var(--space-4)', textAlign:'center', cursor:'pointer' }}
            onClick={() => setStatus(s.label.toLowerCase() === 'total' ? 'all' : s.label.toLowerCase())}>
            <p style={{ fontSize:'1.5rem', fontWeight:800, color:s.color, margin:'0 0 2px' }}>{s.value}</p>
            <p style={{ fontSize:'0.65rem', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.06em', margin:0 }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Search + Filter */}
      <div style={{ display:'flex', gap:'var(--space-3)', marginBottom:'var(--space-6)', flexWrap:'wrap', alignItems:'center' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'var(--space-2)', background:'var(--input-bg)', border:'1px solid var(--input-border)', borderRadius:'var(--radius-md)', padding:'0 var(--space-4)', height:42, flex:1, minWidth:200, maxWidth:340 }}>
          <SearchIcon size={15} color="var(--text-muted)"/>
          <input
            placeholder="Search schools..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ background:'none', border:'none', color:'var(--text-primary)', fontSize:'0.85rem', outline:'none', flex:1 }}/>
        </div>
        <div style={{ display:'flex', gap:'var(--space-1)', flexWrap:'wrap' }}>
          {STATUS_TABS.map(tab => (
            <button key={tab.value} onClick={() => setStatus(tab.value)}
              style={{
                padding:'6px 14px', borderRadius:999, fontSize:'0.75rem', fontWeight:700,
                background: status===tab.value ? 'rgba(239,68,68,0.12)' : 'var(--glass-bg)',
                border: `1px solid ${status===tab.value ? 'rgba(239,68,68,0.3)' : 'var(--glass-border)'}`,
                color: status===tab.value ? '#EF4444' : 'var(--text-muted)',
                cursor:'pointer', whiteSpace:'nowrap',
              }}>
              {tab.label} {tab.value !== 'all' && `(${(counts as any)[tab.value] ?? 0})`}
            </button>
          ))}
        </div>
      </div>

      {/* Schools grid */}
      {filtered.length === 0
        ? <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'var(--space-4)', padding:'var(--space-16)', color:'var(--text-muted)', textAlign:'center' }}>
            <SchoolIcon size={48} color="var(--text-faint)" strokeWidth={1}/>
            <p style={{ fontSize:'0.9rem', margin:0 }}>
              {search ? `No schools matching "${search}"` : `No ${status} schools`}
            </p>
          </div>
        : <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:'var(--space-5)' }}>
            {filtered.map(school => (
              <div key={school.id} style={{ position:'relative' }}>
                <Link href={`/super-admin/school/${school.id}`}
                  style={{ position:'absolute', inset:0, zIndex:1, borderRadius:'var(--radius-xl)' }}/>
                <SchoolCard school={school} onRefresh={() => window.location.reload()}/>
              </div>
            ))}
          </div>
      }

      {showSetup && (
        <SchoolSetupModal
          onClose={() => setShowSetup(false)}
          onSuccess={() => { setShowSetup(false); window.location.reload() }}
        />
      )}
    </div>
  )
}
