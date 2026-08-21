// src/app/dashboard/ict/tickets/page.tsx
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect }          from 'next/navigation'
import { getIctAppointment } from '@/lib/permissions'
import TicketsClient          from './TicketsClient'

export default async function IctTicketsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('school_id, full_name, schools(primary_color)').eq('id', user.id).single()
  if (!profile?.school_id) redirect('/login')

  const admin = createAdminClient()
  const appointment = await getIctAppointment(admin, user.id, profile.school_id)
  if (!appointment) redirect('/dashboard')

  const { data: rawTickets } = await admin
    .from('ict_tickets')
    .select('id, reporter_id, location, category, description, priority, status, assigned_to, created_at, profiles!ict_tickets_reporter_id_fkey(full_name)')
    .eq('school_id', profile.school_id)
    .order('created_at', { ascending: false })
    .limit(100)

  // Supabase's generated types infer a to-one !fkey join as an array;
  // it's always a single row at runtime for reporter_id -> profiles.id.
  // Same normalization as appointments.ts listDepartments().
  const tickets = (rawTickets ?? []).map((t: any) => ({
    ...t,
    profiles: Array.isArray(t.profiles) ? t.profiles[0] : t.profiles,
  }))

  const { data: ictStaff } = await admin
    .from('appointments')
    .select('profile_id, profiles!appointments_profile_id_fkey(full_name)')
    .eq('school_id', profile.school_id)
    .eq('status', 'active')
    .in('appointment_type', ['ict_officer', 'ict_administrator'])

  const school = (profile as any).schools ?? null

  return (
    <TicketsClient
      initialTickets={tickets}
      ictStaff={(ictStaff ?? []).map((a: any) => ({ id: a.profile_id, name: a.profiles?.full_name }))}
      schoolColor={school?.primary_color ?? '#800020'}
    />
  )
}
