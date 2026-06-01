export interface SystemStats {
  total_users: number
  total_students: number
  total_teachers: number
  total_parents: number
  total_schools: number
  pending_onboarding: number
}

export interface PendingUser {
  id: string
  full_name: string
  email: string
  role: string
  onboarding_stage: string
  created_at: string
}

export interface AuditEntry {
  id: string
  action: string
  actor_name: string
  target_table: string | null
  logged_at: string
  ip_address: string | null
}