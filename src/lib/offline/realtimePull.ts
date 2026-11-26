// src/lib/offline/realtimePull.ts
// Pure helper (no React, no Supabase) for the realtime bridge. A realtime event only says
// "something changed in table X"; instead of patching local rows by hand (and trusting
// DELETE events, which RLS cannot filter), it schedules a small incremental pull of that
// table. Many events in a burst (a teacher saving 40 attendance rows) become ONE pull.

export interface PullScheduler {
  /** Note that `table` changed on the server. */
  notify(table: string): void
  /** Cancel anything waiting (unmount / sign-out). */
  stop(): void
}

export function createPullScheduler(opts: {
  /** Pull these tables. Resolves when done; errors are swallowed by the scheduler. */
  pull: (tables: string[]) => Promise<void>
  /** Wait this long after the LAST event before pulling. */
  delayMs?: number
  /** Skip pulling while this returns false (offline or backend down). */
  canPull?: () => boolean
}): PullScheduler {
  const delay = opts.delayMs ?? 1500
  const pending = new Set<string>()
  let timer: ReturnType<typeof setTimeout> | null = null
  let stopped = false

  async function flush() {
    timer = null
    if (stopped || pending.size === 0) return
    if (opts.canPull && !opts.canPull()) {
      // Keep the names; the next event or the periodic pull will pick them up.
      return
    }
    const tables = [...pending]
    pending.clear()
    try {
      await opts.pull(tables)
    } catch {
      // The periodic sync is the safety net.
    }
  }

  return {
    notify(table) {
      if (stopped) return
      pending.add(table)
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => void flush(), delay)
    },
    stop() {
      stopped = true
      if (timer) clearTimeout(timer)
      timer = null
      pending.clear()
    },
  }
}
