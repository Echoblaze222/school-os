// src/lib/savedView/currentUserId.ts
// Who is signed in on this device right now, WITHOUT a network call.
// getSession() only reads the session the browser already holds, so this is
// instant even offline. Used only to decide whether a saved copy belongs to
// the person using the phone; it grants no access to anything.

import { createClient } from '@/lib/supabase/client'

export async function currentUserId(): Promise<string | null> {
  try {
    const { data } = await createClient().auth.getSession()
    return data.session?.user?.id ?? null
  } catch {
    return null
  }
}
