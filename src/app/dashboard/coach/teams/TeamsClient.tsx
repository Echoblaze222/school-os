'use client'

import { useEffect, useState } from 'react'
import RolePageWrapper from '@/components/RolePageWrapper'
import { PeopleIcon, PlusIcon, XIcon, SearchIcon, UserIcon } from '@/components/Icons'
import { SkeletonList } from '@/components/motion/Skeleton'
import EmptyState from '@/components/motion/EmptyState'
import ActionButton from '@/components/motion/ActionButton'
import { Toast, useToast } from '@/components/motion/Toast'
import styles from '../coach.module.css'
import motion from '@/components/dashboard-motion.module.css'
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh'

interface Props { profile: any; school: any; userId: string }

export default function TeamsClient({ profile, school, userId }: Props) {
  const { toast, showToast } = useToast()
  const [teams, setTeams] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showTeamForm, setShowTeamForm] = useState(false)
  const [savingTeam, setSavingTeam] = useState(false)
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [sport, setSport] = useState('')
  const [season, setSeason] = useState('')

  const [rosterTeamId, setRosterTeamId] = useState<string | null>(null)
  const [studentQuery, setStudentQuery] = useState('')
  const [studentResults, setStudentResults] = useState<any[]>([])
  const [addingId, setAddingId] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)

  async function loadTeams() {
    setLoading(true)
    try {
      const res = await fetch('/api/coach/teams')
      const json = await res.json()
      setTeams(json.ok ? json.teams : [])
    } finally { setLoading(false) }
  }

  useEffect(() => { loadTeams() }, [])

  // A school can have more than one coach across different sports, all
  // pulling from the same team/roster list.
  useRealtimeRefresh({ tables: ['sports_teams', 'sports_team_members'], onChange: loadTeams })

  useEffect(() => {
    if (!studentQuery.trim()) { setStudentResults([]); return }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/coach/students?search=${encodeURIComponent(studentQuery)}`)
      const json = await res.json()
      setStudentResults(json.ok ? json.students : [])
    }, 250)
    return () => clearTimeout(t)
  }, [studentQuery])

  async function createTeam() {
    if (!name.trim() || !sport.trim()) { showToast('Team name and sport are required.'); return }
    setSavingTeam(true)
    try {
      const res = await fetch('/api/coach/teams', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, sport, season }),
      })
      const json = await res.json()
      if (!json.ok) { showToast(json.error ?? 'Could not create team.'); return }
      showToast('Team created.')
      setShowTeamForm(false); setName(''); setSport(''); setSeason('')
      loadTeams()
    } finally { setSavingTeam(false) }
  }

  async function addPlayer(teamId: string, studentId: string) {
    setAddingId(studentId)
    try {
      const res = await fetch(`/api/coach/teams/${teamId}/roster`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId }),
      })
      const json = await res.json()
      if (!json.ok) { showToast(json.error ?? 'Could not add player.'); return }
      setStudentQuery(''); setStudentResults([]); loadTeams()
    } finally { setAddingId(null) }
  }

  async function removePlayer(teamId: string, memberId: string) {
    setRemovingId(memberId)
    try {
      const res = await fetch(`/api/coach/teams/${teamId}/roster`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId }),
      })
      const json = await res.json()
      if (!json.ok) { showToast(json.error ?? 'Could not remove player.'); return }
      loadTeams()
    } finally { setRemovingId(null) }
  }

  return (
    <RolePageWrapper userId={userId} role="coach" profile={profile} school={school} title="Teams">
      <main className={styles.main}>
        <ActionButton onClick={() => setShowTeamForm(true)} icon={<PlusIcon size={16} />} fullWidth>
          Create a Team
        </ActionButton>

        <p className={styles.sectionLabel} style={{ marginTop: 'var(--space-5)' }}>Your teams</p>
        {loading ? <SkeletonList count={3} variant="card" /> : teams.length === 0 ? (
          <EmptyState icon={<PeopleIcon size={28} />} title="No teams yet" subtitle="Create your first team to start building a roster." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {teams.map(t => {
              const expanded = expandedTeam === t.id
              return (
                <div key={t.id} className="glass-card" style={{ padding: 14, borderRadius: 'var(--radius-lg)' }}>
                  <button onClick={() => setExpandedTeam(expanded ? null : t.id)}
                    style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}>
                    <div>
                      <p style={{ fontWeight: 700, fontSize: '0.86rem', margin: 0 }}>{t.name}</p>
                      <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>{t.sport}{t.season ? ` · ${t.season}` : ''}</p>
                    </div>
                    <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>{(t.members ?? []).length} players</span>
                  </button>

                  {expanded && (
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--glass-border)' }}>
                      {(t.members ?? []).length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                          {t.members.map((m: any) => {
                            const student = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles
                            return (
                              <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 8, borderRadius: 8, background: 'var(--glass-bg)' }}>
                                <span style={{ fontSize: '0.82rem' }}>{student?.full_name}{m.jersey_number ? ` #${m.jersey_number}` : ''}</span>
                                <button onClick={() => removePlayer(t.id, m.id)} disabled={removingId === m.id}
                                  style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer' }}>
                                  <XIcon size={14} />
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      )}
                      <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: 10, top: 10, color: 'var(--text-muted)' }}><SearchIcon size={13} /></span>
                        <input
                          value={rosterTeamId === t.id ? studentQuery : ''}
                          onFocus={() => setRosterTeamId(t.id)}
                          onChange={e => { setRosterTeamId(t.id); setStudentQuery(e.target.value) }}
                          placeholder="Add a player by name"
                          style={{ width: '100%', padding: '8px 10px 8px 28px', borderRadius: 8, border: '1px solid var(--input-border)', background: 'var(--input-bg)', fontSize: '0.82rem' }}
                        />
                      </div>
                      {rosterTeamId === t.id && studentResults.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                          {studentResults.map(s => (
                            <button key={s.id} onClick={() => addPlayer(t.id, s.id)} disabled={addingId === s.id}
                              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 7, borderRadius: 8, border: 'none', background: 'var(--glass-bg)', cursor: 'pointer', textAlign: 'left', fontSize: '0.8rem' }}>
                              <UserIcon size={13} /> {addingId === s.id ? 'Adding…' : s.full_name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
        <div style={{ height: 100 }} />
      </main>

      {showTeamForm && (
        <div onClick={() => setShowTeamForm(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', zIndex: 100 }}>
          <div onClick={e => e.stopPropagation()} className="glass-card" style={{ width: '100%', maxHeight: '88vh', overflowY: 'auto', padding: 20, borderRadius: '20px 20px 0 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <p style={{ fontWeight: 800, fontSize: '1rem', margin: 0 }}>Create a Team</p>
              <button onClick={() => setShowTeamForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><XIcon size={18} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input placeholder="Team name (e.g. Senior Football)" value={name} onChange={e => setName(e.target.value)}
                style={{ padding: 10, borderRadius: 10, border: '1px solid var(--input-border)', background: 'var(--input-bg)' }} />
              <input placeholder="Sport" value={sport} onChange={e => setSport(e.target.value)}
                style={{ padding: 10, borderRadius: 10, border: '1px solid var(--input-border)', background: 'var(--input-bg)' }} />
              <input placeholder="Season (optional)" value={season} onChange={e => setSeason(e.target.value)}
                style={{ padding: 10, borderRadius: 10, border: '1px solid var(--input-border)', background: 'var(--input-bg)' }} />
              <ActionButton onClick={createTeam} loading={savingTeam} loadingLabel="Creating…" fullWidth>Create Team</ActionButton>
            </div>
          </div>
        </div>
      )}

      <Toast toast={toast} />
    </RolePageWrapper>
  )
}
