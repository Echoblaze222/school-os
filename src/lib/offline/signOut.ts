// src/lib/offline/signOut.ts
// CLIENT ONLY. Called by signOutFlow before the session is revoked: if this user
// has changes saved on the phone that have not uploaded yet, try once to send
// them now (the session is still valid). Anything that still cannot be sent
// stays in the outbox, scoped to this user, and uploads the next time the same
// user signs in; it is never sent under anyone else's account.
//
// Must never throw or hang sign-out: the caller also caps it with a timeout.

import type { SupabaseClient } from '@supabase/supabase-js'
import { offlineStorageAvailable } from './db'
import { getOutboxCounts } from './outbox'
import { flushOutbox, type SyncClient } from './syncEngine'

export async function flushBeforeSignOut(supabase: SupabaseClient): Promise<void> {
  try {
    if (!offlineStorageAvailable()) return
    const { data } = await supabase.auth.getSession()
    const userId = data.session?.user?.id
    if (!userId) return
    const { pending } = await getOutboxCounts(userId)
    if (pending === 0) return
    await flushOutbox(supabase as unknown as SyncClient, userId)
  } catch {
    // Sign-out always wins.
  }
}
