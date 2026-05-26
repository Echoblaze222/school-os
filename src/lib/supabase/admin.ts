// lib/supabase/admin.ts
import { createClient } from '@supabase/supabase-js'

// Only use this on the server — never expose service role key to client
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
