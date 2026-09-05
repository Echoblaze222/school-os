'use client'

import { useEffect, useState } from 'react'
import RolePageWrapper from '@/components/RolePageWrapper'
import { TrophyIcon, PlusIcon, XIcon } from '@/components/Icons'
import { SkeletonList } from '@/components/motion/Skeleton'
import EmptyState from '@/components/motion/EmptyState'
import ActionButton from '@/components/motion/ActionButton'
import { Toast, useToast } from '@/components/motion/Toast'
import styles from '../coach.module.css'
import motion from '@/components/dashboard-motion.module.css'
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh'

interface Props { profile: any; school: any; userId: string }

const STATUS_COLOR: Record<string, string> = {
  scheduled: 'var(--brand)', completed: 'var(--status-ok, #10B981)',
  cancelled: '#EF4444', postponed: 'var(--status-warn, #E4572E)',
}

function one<T>(v: T | T[] | null): T | null { return Array.isArray(v) ? (v[0] ?? null) : v }
function formatDateTime(iso: string) { return new Date(iso).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' }) }

export default function MatchesClient({ profile, school, userId }: Props) {
  const { toast, showToast } = useToast()
  const [matches, setMatches] = useState<any[]>([])
  const [teams, setTeams] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [resultMatch, setResultMatch] = useState<any | null>(null)
  const [ourScore, setOurScore] = useState('')
  const [opponentScore, setOpponentScore] = useState('')
  const [savingResult, setSavingResult] = useState(false)

  const [teamId, setTeamId] = useState('')
  const [opponent, setOpponent] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [location, setLocation] = useState('')
  const [isHome, setIsHome] = useState(true)

  async function loadAll() {
    setLoading(true)
    try {
      const [matchesRes, teamsRes] = await Promise.all([fetch('/api/coach/matches'), fetch('/api/coach/teams')])
      const matchesJson = await matchesRes.json()
      const teamsJson = await teamsRes.json()
      setMatches(matchesJson.ok ? matchesJson.matches : [])
      setTeams(teamsJson.ok ? teamsJson.teams : [])
    } finally { setLoading(false) }
  }

  useEffect(() => { loadAll() }, [])

  useRealtimeRefresh({ tables: ['sports_matches'], onChange: loadAll })

  async function createMatch() {
    if (!teamId || !opponent.trim() || !scheduledAt) { showToast('Pick a team, opponent and time.'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/coach/matches', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, opponent, scheduledAt: new Date(scheduledAt).toISOString(), location, isHome }),
      })
      const json = await res.json()
      if (!json.ok) { showToast(json.error ?? 'Could not schedule match.'); return }
      showToast('Match scheduled.')
      setShowForm(false); setTeamId(''); setOpponent(''); setScheduledAt(''); setLocation(''); setIsHome(true)
      loadAll()
    } finally { setSaving(false) }
  }

  function openResult(m: any) {
    setResultMatch(m); setOurScore(m.our_score ?? ''); setOpponentScore(m.opponent_score ?? '')
  }

  async function saveResult() {
    if (!resultMatch) return
    setSavingResult(true)
    try {
      const res = await fetch('/api/coach/matches', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: resultMatch.id, status: 'completed', ourScore: Number(ourScore || 0), opponentScore: Number(opponentScore || 0) }),
      })
      const json = await res.json()
      if (!json.ok) { showToast(json.error ?? 'Could not save result.'); return }
      showToast('Result saved.')
      setResultMatch(null); loadAll()
    } finally { setSavingResult(false) }
  }

  return (
    <RolePageWrapper userId={userId} role="coach" profile={profile} school={school} title="Matches">
      <main className={styles.main}>
        <ActionButton onClick={() => setShowForm(true)} icon={<PlusIcon size={16} />} fullWidth disabled={teams.length === 0}>
          {teams.length === 0 ? 'Create a team first' : 'Schedule a Match'}
        </ActionButton>

        <p className={styles.sectionLabel} style={{ marginTop: 'var(--space-5)' }}>Fixtures</p>
        {loading ? <SkeletonList count={4} variant="card" /> : matches.length === 0 ? (
          <EmptyState icon={<TrophyIcon size={28} />} title="No matches scheduled yet" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {matches.map(m => {
              const team = one(m.team)
              return (
                <div key={m.id} className={`glass-card ${motion.pressable}`} style={{ padding: 14, borderRadius: 'var(--radius-lg)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div>
                      <p style={{ fontWeight: 700, fontSize: '0.86rem', margin: 0 }}>{team?.name ?? 'Team'} vs {m.opponent}</p>
                      <p style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', margin: '2px 0 0' }}>
                        {formatDateTime(m.scheduled_at)}{m.location ? ` · ${m.location}` : ''} · {m.is_home ? 'Home' : 'Away'}
                      </p>
                    </div>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: STATUS_COLOR[m.status], whiteSpace: 'nowrap', textTransform: 'capitalize' }}>{m.status}</span>
                  </div>
                  {m.status === 'completed' ? (
                    <p style={{ fontSize: '0.9rem', fontWeight: 800, margin: '10px 0 0' }}>{m.our_score} - {m.opponent_score}</p>
                  ) : m.status === 'scheduled' ? (
                    <button onClick={() => openResult(m)}
                      style={{ marginTop: 10, padding: '6px 12px', borderRadius: 8, border: 'none', background: 'var(--brand)', color: '#fff', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer' }}>
                      Record Result
                    </button>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
        <div style={{ height: 100 }} />
      </main>

      {showForm && (
        <div onClick={() => setShowForm(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', zIndex: 100 }}>
          <div onClick={e => e.stopPropagation()} className="glass-card" style={{ width: '100%', maxHeight: '88vh', overflowY: 'auto', padding: 20, borderRadius: '20px 20px 0 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <p style={{ fontWeight: 800, fontSize: '1rem', margin: 0 }}>Schedule a Match</p>
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><XIcon size={18} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <select value={teamId} onChange={e => setTeamId(e.target.value)}
                style={{ padding: 10, borderRadius: 10, border: '1px solid var(--input-border)', background: 'var(--input-bg)' }}>
                <option value="">Select team</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <input placeholder="Opponent" value={opponent} onChange={e => setOpponent(e.target.value)}
                style={{ padding: 10, borderRadius: 10, border: '1px solid var(--input-border)', background: 'var(--input-bg)' }} />
              <input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)}
                style={{ padding: 10, borderRadius: 10, border: '1px solid var(--input-border)', background: 'var(--input-bg)' }} />
              <input placeholder="Location" value={location} onChange={e => setLocation(e.target.value)}
                style={{ padding: 10, borderRadius: 10, border: '1px solid var(--input-border)', background: 'var(--input-bg)' }} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem' }}>
                <input type="checkbox" checked={isHome} onChange={e => setIsHome(e.target.checked)} /> Home match
              </label>
              <ActionButton onClick={createMatch} loading={saving} loadingLabel="Scheduling…" fullWidth>Schedule</ActionButton>
            </div>
          </div>
        </div>
      )}

      {resultMatch && (
        <div onClick={() => setResultMatch(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', zIndex: 100 }}>
          <div onClick={e => e.stopPropagation()} className="glass-card" style={{ width: '100%', padding: 20, borderRadius: '20px 20px 0 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <p style={{ fontWeight: 800, fontSize: '1rem', margin: 0 }}>Record Result</p>
              <button onClick={() => setResultMatch(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><XIcon size={18} /></button>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14 }}>
              <input type="number" placeholder="Us" value={ourScore} onChange={e => setOurScore(e.target.value)}
                style={{ flex: 1, padding: 10, borderRadius: 10, border: '1px solid var(--input-border)', background: 'var(--input-bg)', textAlign: 'center', fontSize: '1.2rem', fontWeight: 800 }} />
              <span style={{ fontWeight: 800 }}>-</span>
              <input type="number" placeholder="Them" value={opponentScore} onChange={e => setOpponentScore(e.target.value)}
                style={{ flex: 1, padding: 10, borderRadius: 10, border: '1px solid var(--input-border)', background: 'var(--input-bg)', textAlign: 'center', fontSize: '1.2rem', fontWeight: 800 }} />
            </div>
            <ActionButton onClick={saveResult} loading={savingResult} loadingLabel="Saving…" fullWidth>Save Result</ActionButton>
          </div>
        </div>
      )}

      <Toast toast={toast} />
    </RolePageWrapper>
  )
}
