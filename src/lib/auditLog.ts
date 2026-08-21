// src/lib/auditLog.ts
//
// Every existing route that writes to portal_audit_log does so with the
// same inline insert (see e.g. api/secretary/create-user/route.ts,
// api/staff-codes/regenerate/route.ts). Pulled into one helper here so
// Lane A's appointment/department writes - and future lanes' - don't each
// re-type the same five fields. Matches the existing shape exactly;
// doesn't change what gets logged or how.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface AuditLogInput {
  actorId: string
  action: string
  targetTable?: string
  targetId?: string
  metadata?: Record<string, unknown>
}

/**
 * Fire-and-forget, same as every existing call site: audit logging must
 * never be the reason a real user action fails, so errors are swallowed
 * (not silently - logged to console.warn - just not surfaced to the user
 * or thrown into the caller's transaction).
 */
export async function auditLog(supabase: SupabaseClient, input: AuditLogInput) {
  try {
    await supabase.from('portal_audit_log').insert({
      actor_id: input.actorId,
      action: input.action,
      target_table: input.targetTable ?? null,
      target_id: input.targetId ?? null,
      metadata: input.metadata ?? null,
      logged_at: new Date().toISOString(),
    })
  } catch (err) {
    console.warn('[auditLog] insert failed (non-critical):', err)
  }
}
