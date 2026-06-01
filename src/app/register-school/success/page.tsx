'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import styles from './success.module.css'

function RegistrationSuccessContent() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const supabase     = createClient()
  const schoolId     = searchParams.get('school')

  const [school,      setSchool]      = useState<any>(null)
  const [defaultCode, setDefaultCode] = useState('')

  useEffect(() => {
    async function loadSchool() {
      if (!schoolId) return

      const { data } = await supabase
        .from('schools')
        .select('name, primary_color, logo_url')
        .eq('id', schoolId)
        .single()

      if (data) setSchool(data)

      // Get the principal's default code
      const { data: principal } = await supabase
        .from('profiles')
        .select('default_code')
        .eq('school_id', schoolId)
        .eq('role', 'principal')
        .single()

      if (principal) setDefaultCode(principal.default_code ?? '')
    }

    loadSchool()
  }, [schoolId])

  return (
    <div className={styles.page}>
      <div className={styles.card}>

        <div className={styles.successIcon}>🎉</div>

        <h1 className={styles.title}>
          {school?.name ?? 'Your School'} is Live!
        </h1>

        <p className={styles.subtitle}>
          Payment confirmed. Your school portal has been activated on SchoolOS.
        </p>

        {defaultCode && (
          <div className={styles.codeBox}>
            <p className={styles.codeLabel}>Your Principal Access Code</p>
            <p className={styles.code}>{defaultCode}</p>
            <p className={styles.codeHint}>
              Use this code to log in to your portal for the first time. Keep it safe.
            </p>
          </div>
        )}

        <div className={styles.nextSteps}>
          <h3>What happens next:</h3>
          <ol>
            <li>Log in with your access code at the portal</li>
            <li>Complete your identity verification (Stage 2 & 3)</li>
            <li>Add your staff and students from the Secretary dashboard</li>
            <li>Distribute access codes to your team</li>
          </ol>
        </div>

        <button
          className="btn btn-primary"
          onClick={() => router.push('/select-school')}
          style={{
            background: school?.primary_color
              ? `linear-gradient(135deg, ${school.primary_color}, ${school.primary_color}CC)`
              : undefined,
            width: '100%',
          }}
        >
          Go to Portal Login →
        </button>

      </div>
    </div>
  )
}

export default function RegistrationSuccessPage() {
  return (
    <Suspense fallback={
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        Loading...
      </div>
    }>
      <RegistrationSuccessContent />
    </Suspense>
  )
}