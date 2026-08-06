'use client'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import LinkChildPrompt from '@/components/LinkChildPrompt'
import TrialBanner from '@/components/TrialBanner'
import RecentActivity, { ActivityItem } from '@/components/RecentActivity'
import RoleHeroHeader from '@/components/RoleHeroHeader'
import GaugeStat from '@/components/GaugeStat'
import AiInsightBanner from '@/components/AiInsightBanner'
import BottomDock from '@/components/BottomDock'
import ChatWidget from '@/components/ChatWidget'
import styles from './parent.module.css'
import motion from '@/components/dashboard-motion.module.css'
import { PARENT_FEATURE_GROUPS as FEATURE_GROUPS } from './featureGroups'

function getCurrentTerm(): string {
  const m = new Date().getMonth() + 1
  if (m >= 9 || m <= 1) return 'First Term'
  if (m >= 5)           return 'Third Term'
  return 'Second Term'
}
function getCurrentYear(): string {
  const now = new Date(); const m = now.getMonth() + 1; const y = now.getFullYear()
  return m >= 9 ? `${y}/${y + 1}` : `${y - 1}/${y}`
}

interface ChildStats { attendance: number | null; gpa: number | null; rank: number | null; pendingTasks: number }
interface Props { profile: any; school: any; userId: string; counts?: any; activities: ActivityItem[] }

function buildInsight(stats: ChildStats, childName: string): string {
  if (stats.attendance != null && stats.attendance < 80) {
    return `${childName}'s attendance is at ${stats.attendance}% this term — below where it usually sits. Worth checking in about what's been keeping them out.`
  }
  if (stats.pendingTasks > 0) {
    return `${childName} has ${stats.pendingTasks} assignment${stats.pendingTasks === 1 ? '' : 's'} due. Attendance and results are both looking normal.`
  }
  return `${childName} is tracking well this term — attendance and assignments are both on pace.`
}

export default function ParentDashboardClient({ profile, school, userId, counts = {}, activities }: Props) {
  const [children,      setChildren]      = useState<any[]>([])
  const [checking,      setChecking]      = useState(true)
  const [showLinkForm,  setShowLinkForm]  = useState(false)
  const [activeChildId, setActiveChildId] = useState<string | null>(null)
  const [childStats,    setChildStats]    = useState<ChildStats>({ attendance: null, gpa: null, rank: null, pendingTasks: 0 })
  const [statsLoading,  setStatsLoading]  = useState(false)

  const supabase = createClient()
  const sc       = school?.primary_color ?? '#800020'

  useEffect(() => { fetchChildren() }, [userId])
  useEffect(() => { if (activeChildId && children.length) loadChildStats(activeChildId) }, [activeChildId, children])

  async function fetchChildren() {
    setChecking(true)
    try {
      const { data: links } = await supabase
        .from('parent_student_links')
        .select('student_id')
        .eq('parent_id', userId)

      if (!links || links.length === 0) {
        setChildren([])
        return
      }

      const ids = links.map((l: any) => l.student_id as string)

      // student_profiles.class_id is what every real write flow updates
      // (student creation, the secretary edit modal, and promotion/transfer
      // all write here) — it's the CURRENT value, especially after a
      // student has been promoted. profiles.class_id is never updated by
      // promotion, so it goes stale for any promoted student; it's used
      // only as a fallback for the rare case where a student has no
      // student_profiles row at all (e.g. incomplete/manually-seeded data).
      const [{ data: pRows }, { data: spRows }] = await Promise.all([
        supabase.from('profiles')
          .select('id, full_name, avatar_url, default_code, school_id, class_id')
          .in('id', ids),
        supabase.from('student_profiles')
          .select('id, class_id')
          .in('id', ids),
      ])

      const classIds = [...new Set(ids.map((sid: string) => {
        const sp = ((spRows ?? []) as any[]).find((r: any) => r.id === sid)
        const p  = ((pRows  ?? []) as any[]).find((r: any) => r.id === sid)
        return sp?.class_id ?? p?.class_id ?? null
      }).filter(Boolean))]
      const { data: classRows } = classIds.length
        ? await supabase.from('classes').select('id, name, class_level').in('id', classIds)
        : { data: [] as any[] }

      const resolved = ids.map((sid: string) => {
        const p  = ((pRows  ?? []) as any[]).find((r: any) => r.id === sid)
        const sp = ((spRows ?? []) as any[]).find((r: any) => r.id === sid)
        const resolvedClassId = sp?.class_id ?? p?.class_id ?? null
        const cl = (classRows ?? []).find((r: any) => r.id === resolvedClassId)
        return {
          id:           sid,
          full_name:    p?.full_name    ?? null,
          avatar_url:   p?.avatar_url   ?? null,
          default_code: p?.default_code ?? null,
          school_id:    p?.school_id    ?? null,
          class_id:     resolvedClassId,
          class_level:  cl?.class_level ?? cl?.name ?? null,
        }
      }).filter((c: any) => !!c.full_name)

      setChildren(resolved)
      if (resolved.length) setActiveChildId(resolved[0].id)
    } catch (err) {
      console.error('fetchChildren failed:', err)
      setChildren([])
    } finally {
      setChecking(false)
    }
  }

  async function loadChildStats(childId: string) {
    setStatsLoading(true)
    try {
      const child = children.find((c: any) => c.id === childId)
      if (!child) return

      const term = getCurrentTerm()
      const year = getCurrentYear()

      const [
        { data: attRows },
        { data: resRows },
        { data: lbRows },
        { count: taskCount },
      ] = await Promise.all([
        supabase.from('attendance')
          .select('status, is_present')
          .eq('student_id', childId)
          .eq('school_id', child.school_id),

        supabase.from('results')
          .select('score, max_score')
          .eq('student_id', childId)
          .eq('school_id', child.school_id)
          .eq('term', term)
          .eq('academic_year', year)
          .eq('approved', true),

        child.class_id
          ? supabase.from('student_leaderboard')
              .select('student_id, total_points')
              .eq('class_id', child.class_id)
              .eq('school_id', child.school_id)
              .eq('term', term)
              .eq('academic_year', year)
              .order('total_points', { ascending: false })
          : Promise.resolve({ data: [] as any[] }),

        supabase.from('assignments')
          .select('*', { count: 'exact', head: true })
          .eq('school_id', child.school_id)
          .eq('class_id', child.class_id)
          .eq('status', 'active'),
      ])

      const total   = attRows?.length ?? 0
      const present = (attRows ?? []).filter((r: any) =>
        r.status === 'present' || (!r.status && r.is_present === true)
      ).length
      const attendance = total > 0 ? Math.round((present / total) * 100) : null

      const valid = (resRows ?? []).filter((r: any) => r.score != null && (r.max_score ?? 0) > 0)
      const gpa   = valid.length > 0
        ? Math.round(((valid.reduce((s: number, r: any) => s + r.score / r.max_score, 0) / valid.length) * 5) * 10) / 10
        : null

      const pos  = (lbRows ?? []).findIndex((r: any) => r.student_id === childId)
      const rank = pos >= 0 ? pos + 1 : null

      setChildStats({ attendance, gpa, rank, pendingTasks: taskCount ?? 0 })
    } catch (err) {
      console.error('loadChildStats failed:', err)
    } finally {
      setStatsLoading(false)
    }
  }

  async function handleDeleteActivity(id: string) {
    await supabase.from('recent_activities').delete().eq('id', id).eq('user_id', userId)
  }

  // ── Loading ──
  if (checking) return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: sc, animation: 'b 1.2s ease infinite', animationDelay: `${i * 0.2}s` }} />
      ))}
      <style>{`@keyframes b{0%,80%,100%{transform:scale(.6);opacity:.4}40%{transform:scale(1);opacity:1}}`}</style>
    </div>
  )

  // ── No children linked yet ──
  if (!children.length && !showLinkForm) {
    return <LinkChildPrompt userId={userId} schoolColor={sc} schoolId={school?.id ?? ''} />
  }

  const activeChild = children.find((c: any) => c.id === activeChildId) ?? children[0]
  const firstName = profile?.full_name?.split(' ')[0] ?? 'there'
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className={styles.page} style={{ background: 'color-mix(in srgb, var(--brand) 6%, var(--bg-base))' }}>
      <RoleHeroHeader
        userId={userId}
        role="parent"
        roleLabel="Parent"
        profile={profile}
        school={school}
        greeting={`${greeting}, ${firstName}`}
        headline={activeChild ? `How ${activeChild.full_name?.split(' ')[0]} is doing.` : 'Your children, at a glance.'}
        sub={activeChild ? `${activeChild.class_level ?? 'No class'} · ${getCurrentTerm()}` : ''}
        featureGroups={FEATURE_GROUPS}
      />

      {school?.setup_status === 'trial' && school?.trial_ends_at && (
        <TrialBanner trialEndsAt={school.trial_ends_at} schoolId={school.id} setupStatus={school.setup_status} schoolColor={sc} />
      )}

      <main className={styles.main}>

        {/* Child selector chips */}
        {children.length > 1 && (
          <div className={motion.riseIn} style={{ display: 'flex', gap: 8, marginTop: 'var(--space-6)', marginBottom: 14, overflowX: 'auto', paddingBottom: 4 }}>
            {children.map((c: any) => (
              <button
                key={c.id}
                onClick={() => setActiveChildId(c.id)}
                className={motion.pressable}
                style={{
                  padding: '7px 16px', borderRadius: 999, fontSize: '0.78rem', fontWeight: 700,
                  background: activeChildId === c.id ? sc : 'var(--glass-bg)',
                  color:      activeChildId === c.id ? '#fff' : 'var(--text-muted)',
                  border:     `1px solid ${activeChildId === c.id ? sc : 'var(--glass-border)'}`,
                  cursor: 'pointer', flexShrink: 0,
                }}>
                {c.full_name?.split(' ')[0]}
              </button>
            ))}
          </div>
        )}

        {/* Animated graphical stats for the active child */}
        {activeChild && (
          <div className={motion.riseIn} style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12,
            marginTop: children.length > 1 ? 0 : 'var(--space-6)', marginBottom: 'var(--space-4)',
          }}>
            <div className={`glass-card ${motion.pressable}`} style={{ padding: 16, borderRadius: 'var(--radius-xl)' }}>
              <GaugeStat label="Attendance" value={statsLoading ? 0 : (childStats.attendance ?? 0)} isPercent
                color="var(--status-ok, #3FA66B)" caption={getCurrentTerm()} />
            </div>
            <div className={`glass-card ${motion.pressable}`} style={{ padding: 16, borderRadius: 'var(--radius-xl)' }}>
              <GaugeStat
                label="Term GPA"
                value={statsLoading ? 0 : (childStats.gpa != null ? Math.round((childStats.gpa / 5) * 100) : 0)}
                isPercent
                displayValue={statsLoading ? '…' : (childStats.gpa != null ? childStats.gpa.toFixed(1) : '—')}
                color="var(--brand-2, var(--brand))" caption="out of 5.0" delayMs={80}
              />
            </div>
            <div className={`glass-card ${motion.pressable}`} style={{ padding: 16, borderRadius: 'var(--radius-xl)' }}>
              <GaugeStat label="Tasks due" value={statsLoading ? 0 : childStats.pendingTasks}
                color="var(--status-warn, #E4572E)" caption="this week" delayMs={160} />
            </div>
          </div>
        )}

        {activeChild && (
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <AiInsightBanner
              insight={buildInsight(childStats, activeChild.full_name?.split(' ')[0] ?? 'Your child')}
              actionLabel="Ask AI →"
              actionHref="/dashboard/parent/ai"
            />
          </div>
        )}

        {/* Active child card */}
        {activeChild && (
          <div className={`${styles.childCard} ${motion.riseIn}`} style={{ borderColor: sc + '40' }}>
            <div className={styles.childAvatar} style={{ background: sc }}>
              {activeChild.avatar_url
                ? <img src={activeChild.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                : <span style={{ fontWeight: 800, color: '#fff', fontSize: '1.1rem' }}>{activeChild.full_name?.[0]}</span>
              }
            </div>
            <div className={styles.childInfo}>
              <p className={styles.childName}>{activeChild.full_name}</p>
              <p className={styles.childMeta}>
                {activeChild.class_level ?? 'No class'} · {activeChild.default_code ?? ''} · {school?.name}
              </p>
            </div>
            <Link href={`/dashboard/parent/child?id=${activeChild.id}`} className={`${styles.viewChildBtn} ${motion.pressable}`} style={{ borderColor: sc + '40', color: sc }}>
              View →
            </Link>
          </div>
        )}

        {/* Link another child */}
        <button
          onClick={() => setShowLinkForm(true)}
          className={motion.pressable}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', margin: '14px 0 20px',
            background: 'var(--glass-bg)', border: `1px solid ${sc}40`,
            borderRadius: 999, color: sc, fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer',
          }}>
          + Link Another Child
        </button>

        {showLinkForm && (
          <div style={{ marginBottom: 16 }}>
            <LinkChildPrompt userId={userId} schoolColor={sc} schoolId={school?.id ?? ''} />
            <button onClick={() => setShowLinkForm(false)}
              style={{ marginTop: 8, fontSize: '0.75rem', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        )}

        <RecentActivity
          items={activities}
          accentColor={sc}
          onDelete={handleDeleteActivity}
          emptyLabel="Nothing yet — updates about your child will show up here"
        />

        <div className={styles.mobileSpace} />
      </main>

      <BottomDock homeHref="/dashboard/parent" aiHref="/dashboard/parent/ai" />
      <ChatWidget userId={userId} role="parent" schoolColor={sc} />
    </div>
  )
}
