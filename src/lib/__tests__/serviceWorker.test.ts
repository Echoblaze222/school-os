/* eslint-disable @typescript-eslint/no-explicit-any -- fake service-worker globals in a test harness */
// src/lib/__tests__/serviceWorker.test.ts
//
// Runs the real public/sw.js inside a Node VM with a fake service-worker
// global (self, caches, fetch) and checks what it will and will not cache.
// The point: logged-in page HTML and other per-user responses must never be
// written to the Cache API, because it outlives logout on a shared phone.

import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import vm from 'node:vm'

const SW_SOURCE = readFileSync(join(process.cwd(), 'public', 'sw.js'), 'utf8')
const ORIGIN = 'https://app.test'

type Listener = (event: any) => void

function boot() {
  const listeners: Record<string, Listener> = {}
  const store = new Map<string, Map<string, unknown>>() // cacheName -> (url -> response)
  const puts: string[] = []
  let fetchImpl: (req: any) => Promise<any> = async () => ({ ok: true, clone: () => ({}) })

  const makeCache = (name: string) => {
    if (!store.has(name)) store.set(name, new Map())
    const m = store.get(name)!
    return {
      add: async (u: string) => { m.set(new URL(u, ORIGIN).href, { ok: true }) },
      put: async (req: any, res: unknown) => { puts.push(`${name} <- ${req.url}`); m.set(req.url, res) },
    }
  }
  const caches = {
    open: async (name: string) => makeCache(name),
    keys: async () => [...store.keys()],
    delete: async (name: string) => store.delete(name),
    match: async (req: any) => {
      const url = typeof req === 'string' ? new URL(req, ORIGIN).href : req.url
      for (const m of store.values()) if (m.has(url)) return m.get(url)
      return undefined
    },
  }

  const self: any = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, fn: Listener) => { listeners[type] = fn },
    skipWaiting: () => {},
    clients: { claim: async () => {}, matchAll: async () => [] },
    registration: { showNotification: async () => {} },
  }

  vm.runInNewContext(SW_SOURCE, {
    self, caches, URL, Promise, console,
    fetch: (req: any) => fetchImpl(req),
    importScripts: () => {}, // no generated precache manifest in tests
  })

  // Dispatch a fetch event; resolves to { handled, response }.
  const doFetch = async (req: { url: string; method?: string; mode?: string; destination?: string }) => {
    let responded: Promise<any> | undefined
    listeners.fetch({
      request: { method: 'GET', mode: 'cors', destination: '', ...req },
      respondWith: (p: Promise<any>) => { responded = Promise.resolve(p) },
    })
    const response = responded ? await responded : undefined
    await new Promise((r) => setTimeout(r, 0)) // let fire-and-forget cache.put settle
    return { handled: !!responded, response }
  }

  return {
    listeners, store, puts, caches, doFetch,
    setFetch: (fn: (req: any) => Promise<any>) => { fetchImpl = fn },
  }
}

const okResponse = () => ({ ok: true, clone: () => okResponse() })

let sw: ReturnType<typeof boot>
beforeEach(() => { sw = boot() })

describe('sw.js - logged-in pages are never stored', () => {
  it('a successful page navigation is served but NOT written to any cache', async () => {
    sw.setFetch(async () => okResponse())
    const { handled } = await sw.doFetch({ url: `${ORIGIN}/dashboard/student`, mode: 'navigate' })
    expect(handled).toBe(true)
    expect(sw.puts).toEqual([])
  })

  it('offline navigation falls back to /offline, never to a previously seen page', async () => {
    // Pretend a logged-in page was cached by an older SW version.
    const cache = await sw.caches.open('schoolos-runtime-v3')
    await cache.put({ url: `${ORIGIN}/dashboard/student` }, { page: 'previous user' })
    sw.puts.length = 0
    await (await sw.caches.open('schoolos-shell-v4')).add('/offline')
    sw.setFetch(async () => { throw new Error('offline') })

    const { response } = await sw.doFetch({ url: `${ORIGIN}/dashboard/student`, mode: 'navigate' })
    expect(response).toEqual({ ok: true }) // the /offline entry, not the old page
  })

  it('does not intercept Next.js RSC/data fetches for dashboard pages', async () => {
    const { handled } = await sw.doFetch({ url: `${ORIGIN}/dashboard/student?_rsc=abc`, destination: '' })
    expect(handled).toBe(false)
  })

  it('does not intercept cross-origin requests (e.g. signed Supabase file URLs)', async () => {
    const a = await sw.doFetch({ url: 'https://x.supabase.co/storage/v1/object/sign/receipts/a.png?token=t', destination: 'image' })
    const b = await sw.doFetch({ url: 'https://evil.test/icons/x.png', destination: 'image' })
    expect(a.handled).toBe(false)
    expect(b.handled).toBe(false)
  })

  it('never intercepts /api/ or non-GET requests', async () => {
    expect((await sw.doFetch({ url: `${ORIGIN}/api/fees` })).handled).toBe(false)
    expect((await sw.doFetch({ url: `${ORIGIN}/dashboard`, method: 'POST', mode: 'navigate' })).handled).toBe(false)
  })
})

describe('sw.js - still caches what is safe', () => {
  it('hashed build assets are cached cache-first', async () => {
    sw.setFetch(async () => okResponse())
    const { handled } = await sw.doFetch({ url: `${ORIGIN}/_next/static/chunks/app.js`, destination: 'script' })
    expect(handled).toBe(true)
    expect(sw.puts.some((p) => p.includes('schoolos-shell-v4') && p.includes('/_next/static/'))).toBe(true)
  })

  it('same-origin images are stale-while-revalidate, and failed responses are not cached', async () => {
    sw.setFetch(async () => ({ ok: false, clone: () => ({}) }))
    await sw.doFetch({ url: `${ORIGIN}/branding/logo.png`, destination: 'image' })
    expect(sw.puts).toEqual([])

    sw.setFetch(async () => okResponse())
    await sw.doFetch({ url: `${ORIGIN}/branding/logo.png`, destination: 'image' })
    expect(sw.puts).toEqual([`schoolos-runtime-v4 <- ${ORIGIN}/branding/logo.png`])
  })
})

describe('sw.js - housekeeping', () => {
  it('activate deletes every cache that is not from this version (purges v3 page cache)', async () => {
    await sw.caches.open('schoolos-runtime-v3')
    await sw.caches.open('schoolos-shell-v3')
    await sw.caches.open('schoolos-runtime-v4')
    await sw.caches.open('schoolos-shell-v4')
    let done: Promise<unknown> | undefined
    sw.listeners.activate({ waitUntil: (p: Promise<unknown>) => { done = p } })
    await done
    expect([...sw.store.keys()].sort()).toEqual(['schoolos-runtime-v4', 'schoolos-shell-v4'])
  })

  it('CLEAR_RUNTIME_CACHE message empties the runtime cache but keeps the app shell', async () => {
    await sw.caches.open('schoolos-runtime-v4')
    await sw.caches.open('schoolos-shell-v4')
    let done: Promise<unknown> | undefined
    sw.listeners.message({ data: { type: 'CLEAR_RUNTIME_CACHE' }, waitUntil: (p: Promise<unknown>) => { done = p } })
    await done
    expect([...sw.store.keys()]).toEqual(['schoolos-shell-v4'])
  })
})
