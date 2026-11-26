// src/lib/offline/flags.ts
// The read-side sync is shipped dark: nothing pulls and no screen reads from the local
// copy until NEXT_PUBLIC_OFFLINE_READ_SYNC=1 is set (Vercel env var, then redeploy), and
// the Supabase migration sql/migrations/2026-11-25-offline-read-sync.sql is applied.
// Without the migration the pull would fail on every device, so keep the flag off until
// it is applied.

export function readSyncEnabled(): boolean {
  return process.env.NEXT_PUBLIC_OFFLINE_READ_SYNC === '1'
}
