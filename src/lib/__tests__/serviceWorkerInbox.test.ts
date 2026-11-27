/* eslint-disable @typescript-eslint/no-explicit-any -- fake service-worker globals in a test harness */
// src/lib/__tests__/serviceWorkerInbox.test.ts
//
// Runs the real public/sw.js in a Node VM with a tiny in-memory IndexedDB and
// checks the offline notification inbox it keeps: right user, no cross-user
// leftovers on a shared phone, size cap, and that a push is always shown even
// if the inbox can't be written.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import vm from 'node:vm'

const SW_SOURCE = readFileSync(join(process.cwd(), 'public', 'sw.js'), 'utf8')

// Minimal fake of the parts of IndexedDB that sw.js uses.
function fakeIndexedDB() {
  const dbs = new Map<string, Map<string, { keyPath: string; rows: Map<any, any> }>>()
  return {
    dbs,
    open(name: string) {
      const req: any = {}
      setTimeout(() => {
        if (!dbs.has(name)) dbs.set(name, new Map())
        const stores = dbs.get(name)!
        const db: any = {
          objectStoreNames: { contains: (s: string) => stores.has(s) },
          createObjectStore: (s: string, opts: { keyPath: string }) => {
            stores.set(s, { keyPath: opts.keyPath, rows: new Map() })
          },
          close: () => {},
          transaction: (storeName: string) => {
            const tx: any = {}
            const store = stores.get(storeName)!
            tx.objectStore = () => ({
              getAll: () => {
                const r: any = {}
                setTimeout(() => {
                  r.result = [...store.rows.values()]
                  r.onsuccess?.()
                  setTimeout(() => tx.oncomplete?.(), 0)
                }, 0)
                return r
              },
              put: (item: any) => { store.rows.set(item[store.keyPath], item) },
              delete: (key: any) => { store.rows.delete(key) },
            })
            return tx
          },
        }
        req.result = db
        req.onupgradeneeded?.()
        req.onsuccess?.()
      }, 0)
      return req
    },
  }
}

function boot(withIndexedDB = true) {
  const listeners: Record<string, (e: any) => void> = {}
  const shown: Array<{ title: string; options: any }> = []
  const idb = fakeIndexedDB()
  const self: any = {
    location: { origin: 'https://app.test' },
    addEventListener: (type: string, fn: (e: any) => void) => { listeners[type] = fn },
    skipWaiting: () => {},
    clients: { claim: async () => {}, matchAll: async () => [] },
    registration: { showNotification: async (title: string, options: any) => { shown.push({ title, options }) } },
  }
  const ctx: any = { self, caches: {}, URL, Promise, console, setTimeout, fetch: async () => ({}), importScripts: () => {} }
  if (withIndexedDB) ctx.indexedDB = idb
  vm.runInNewContext(SW_SOURCE, ctx)

  const push = async (payload: any) => {
    let waited: Promise<unknown> | undefined
    listeners.push({
      data: { json: () => payload, text: () => '' },
      waitUntil: (p: Promise<unknown>) => { waited = p },
    })
    await waited
  }
  const inbox = () => [...(idb.dbs.get('schoolos-inbox')?.get('items')?.rows.values() ?? [])]
  return { push, shown, inbox }
}

const msg = (over: Record<string, unknown> = {}) => ({
  title: 'Fee reminder', body: 'Term 2 fees due Friday', url: '/dashboard/parent/fees',
  tag: `t-${Math.random()}`, userId: 'user-a', sentAt: 1_700_000_000_000, ...over,
})

describe('sw.js - offline notification inbox', () => {
  it('shows the notification and keeps a copy for the right user', async () => {
    const sw = boot()
    const m = msg({ tag: 'tag-1' })
    await sw.push(m)
    expect(sw.shown).toHaveLength(1)
    expect(sw.inbox()).toEqual([{
      id: 'tag-1', userId: 'user-a', title: 'Fee reminder',
      body: 'Term 2 fees due Friday', url: '/dashboard/parent/fees', receivedAt: 1_700_000_000_000,
    }])
  })

  it('deletes another user\'s copies first, so a shared phone never holds two people\'s notifications', async () => {
    const sw = boot()
    await sw.push(msg({ tag: 'a1', userId: 'user-a', sentAt: Date.now() }))
    await sw.push(msg({ tag: 'b1', userId: 'user-b', sentAt: Date.now() }))
    expect(sw.inbox().map((i: any) => i.id)).toEqual(['b1'])
  })

  it('keeps nothing when the push has no userId, but still shows it', async () => {
    const sw = boot()
    await sw.push(msg({ userId: undefined }))
    expect(sw.shown).toHaveLength(1)
    expect(sw.inbox()).toEqual([])
  })

  it('caps the inbox at 50, keeping the newest', async () => {
    const sw = boot()
    const now = Date.now()
    for (let i = 0; i < 55; i++) await sw.push(msg({ tag: `n${i}`, sentAt: now + i }))
    const ids = sw.inbox().map((i: any) => i.id)
    expect(ids).toHaveLength(50)
    expect(ids).toContain('n54')
    expect(ids).not.toContain('n0')
  })

  it('drops copies older than 7 days', async () => {
    const sw = boot()
    const eightDays = 8 * 24 * 60 * 60 * 1000
    await sw.push(msg({ tag: 'old', sentAt: Date.now() - eightDays }))
    await sw.push(msg({ tag: 'new', sentAt: Date.now() }))
    expect(sw.inbox().map((i: any) => i.id)).toEqual(['new'])
  })

  it('still shows the notification when IndexedDB is unavailable', async () => {
    const sw = boot(false)
    await sw.push(msg())
    expect(sw.shown).toHaveLength(1)
  })
})
