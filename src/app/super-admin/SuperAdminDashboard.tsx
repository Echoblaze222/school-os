'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  SchoolIcon, PlusIcon, WalletIcon,
  SearchIcon, RefreshIcon, CheckCircleIcon, ClockIcon,
  FlameIcon, XIcon, PauseIcon,
} from '@/components/Icons'
import SchoolSetupModal from './SchoolSetupModal'
import SchoolCard from './SchoolCard'
import styles from './super-admin.module.css'

interface School {
  id: string; name: string; slug: string
  setup_status: string; trial_days_left: number
  free_days_left: number; sub_days_left: number
  subscription_plan: string; installment_count: number
  total_students: number; total_paid_ngn: number
  trial_active_score: number; notes: string
  trial_ends_at: string; next_payment_due: string
}

export default function SuperAdminDashboard() {
  const [schools,      setSchools]      = useState<School[]>([])
  const [filtered,     setFiltered]     = useState<School[]>([])
  const [loading,      setLoading]      = useState(true)
  const [search,       setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [showSetup,    setShowSetup]    = useState(false)
  const [stats,        setStats]        = useState({ total: 0, trial: 0, active: 0, expired: 0, suspended: 0, revenue: 0 })
  const supabase = createClient()

  useEffect(() => { loadSchools() }, [])

  useEffect(() => {
    let list = schools
    if (search) list = list.filter(s => s.name.toLowerCase().includes(search.toLowerCase()))
    if (statusFilter !== 'all') list = list.filter(s => s.setup_status === statusFilter)
    setFiltered(list)
  }, [search, statusFilter, schools])

  async function loadSchools() {
    setLoading(true)
    const { data } = await supabase
      .from('school_subscription_summary')
      .select('*')
      .order('setup_status', { ascending: true })
    if (data) {
      setSchools(data as School[])
      setFiltered(data as School[])
      setStats({
        total:     data.length,
        trial:     data.filter(s => s.setup_status === 'trial').length,
        active:    data.filter(s => s.setup_status === 'active').length,
        expired:   data.filter(s => s.setup_status === 'expired').length,
        suspended: data.filter(s => s.setup_status === 'suspended').length,
        revenue:   data.reduce((sum, s) => sum + (s.total_paid_ngn ?? 0), 0),
      })
    }
    setLoading(false)
  }

  const STATUS_TABS = [
    { value: 'all',       label: 'All',       count: stats.total,     Icon: null },
    { value: 'trial',     label: 'Trial',     count: stats.trial,     Icon: FlameIcon },
    { value: 'active',    label: 'Active',    count: stats.active,    Icon: CheckCircleIcon },
    { value: 'expired',   label: 'Expired',   count: stats.expired,   Icon: XIcon },
    { value: 'suspended', label: 'Suspended', count: stats.suspended, Icon: PauseIcon },
  ]

  return (
    <>
      {/* ── MAIN ──────────────────────────────────────────── */}
      <main className={styles.main}>

        {/* Header */}
        <div className={styles.topBar}>
          <div>
            <h1 className={styles.pageTitle}>School Management</h1>
            <p className={styles.pageSub}>Manage all school setups, trials, and subscriptions</p>
          </div>
          <div className={styles.topActions}>
            <button className={styles.refreshBtn} onClick={loadSchools}>
              <RefreshIcon size={15} />
            </button>
            <button className={styles.addSchoolBtn} onClick={() => setShowSetup(true)}>
              <PlusIcon size={16} color="white" />
              Add School
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className={styles.statsGrid}>
          {[
            { label: 'Total Schools',  value: stats.total,                         color: '#800020', icon: SchoolIcon },
            { label: 'On Trial',       value: stats.trial,                         color: '#F59E0B', icon: FlameIcon  },
            { label: 'Active',         value: stats.active,                        color: '#10B981', icon: CheckCircleIcon },
            { label: 'Expired',        value: stats.expired,                       color: '#EF4444', icon: ClockIcon  },
            { label: 'Total Revenue',  value: `₦${(stats.revenue/1000).toFixed(0)}k`, color: '#10B981', icon: WalletIcon },
          ].map(s => (
            <div key={s.label} className={styles.statCard}>
              <div className={styles.statIcon} style={{ background: s.color + '20' }}>
                <s.icon size={18} color={s.color} />
              </div>
              <div>
                <p className={styles.statVal}>{s.value}</p>
                <p className={styles.statLabel}>{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Search + Filter */}
        <div className={styles.toolbar}>
          <div className={styles.searchBox}>
            <SearchIcon size={15} color="var(--text-muted)" />
            <input
              className={styles.searchInput}
              placeholder="Search schools..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className={styles.tabs}>
            {STATUS_TABS.map(tab => (
              <button key={tab.value}
                className={`${styles.tab} ${statusFilter === tab.value ? styles.tabActive : ''}`}
                onClick={() => setStatusFilter(tab.value)}>
                {tab.Icon && <tab.Icon size={13} />} {tab.label} ({tab.count})
              </button>
            ))}
          </div>
        </div>

        {/* Schools list */}
        {loading ? (
          <div className={styles.loadingGrid}>
            {[...Array(6)].map((_,i) => (
              <div key={i} className={`${styles.skeletonCard} skeleton`} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className={styles.empty}>
            <SchoolIcon size={40} color="var(--text-faint)" />
            <p>No schools found</p>
            <button className={styles.addSchoolBtn} onClick={() => setShowSetup(true)}>
              <PlusIcon size={15} color="white" /> Add First School
            </button>
          </div>
        ) : (
          <div className={styles.schoolsGrid}>
            {filtered.map(school => (
              <SchoolCard key={school.id} school={school} onRefresh={loadSchools} />
            ))}
          </div>
        )}
      </main>

      {/* Setup Modal */}
      {showSetup && (
        <SchoolSetupModal
          onClose={() => setShowSetup(false)}
          onSuccess={() => { setShowSetup(false); loadSchools() }}
        />
      )}
    </>
  )
}
