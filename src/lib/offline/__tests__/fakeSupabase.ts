// Minimal in-memory stand-in for the Supabase query builder, just enough for pullSync.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>

export interface FakeServer {
  tables: Record<string, Row[]>
  /** Table names that should fail with this error code. */
  fail: Record<string, { code?: string; message: string; status?: number }>
  /** Every query seen: [table, select, filters]. */
  log: { table: string; select: string; filters: string[] }[]
}

export function makeServer(tables: Record<string, Row[]> = {}): FakeServer {
  return { tables, fail: {}, log: [] }
}

export function fakeClient(server: FakeServer): any {
  return {
    from(table: string) {
      let select = '*'
      const filters: string[] = []
      const preds: ((r: Row) => boolean)[] = []
      let desc = false
      const orderCols: string[] = []
      let max = Infinity
      let cursor: { at: string; id: string } | null = null

      const exec = () => {
        server.log.push({ table, select, filters: [...filters] })
        const f = server.fail[table]
        if (f) return Promise.resolve({ data: null, error: f, status: f.status ?? 400 })
        let rows = [...(server.tables[table] ?? [])]
        for (const p of preds) rows = rows.filter(p)
        if (cursor) rows = rows.filter((r) => r.updated_at > cursor!.at || (r.updated_at === cursor!.at && String(r.id) > cursor!.id))
        rows.sort((a, b) => {
          for (const c of orderCols) {
            if (a[c] < b[c]) return desc ? 1 : -1
            if (a[c] > b[c]) return desc ? -1 : 1
          }
          return 0
        })
        rows = rows.slice(0, max)
        // honour the column list like PostgREST does
        if (select !== '*') {
          const cols = select.split(',')
          rows = rows.map((r) => Object.fromEntries(cols.filter((c) => c in r).map((c) => [c, r[c]])))
        }
        return Promise.resolve({ data: rows, error: null, status: 200 })
      }

      const q: any = {
        select(s: string) { select = s; return q },
        order(col: string, o?: { ascending?: boolean }) { orderCols.push(col); desc = o?.ascending === false; return q },
        limit(n: number) { max = n; return q },
        abortSignal() { return q },
        or(expr: string) {
          const m = expr.match(/updated_at\.gt\."([^"]+)",and\(updated_at\.eq\."[^"]+",id\.gt\.([^)]+)\)/)
          if (m) cursor = { at: m[1], id: m[2] }
          filters.push(`or:${expr}`)
          return q
        },
        gt(col: string, v: any) { filters.push(`gt:${col}`); preds.push((r) => r[col] > v); return q },
        gte(col: string, v: any) { filters.push(`gte:${col}`); preds.push((r) => String(r[col]) >= v); return q },
        eq(col: string, v: any) { filters.push(`eq:${col}=${v}`); preds.push((r) => r[col] === v); return q },
        in(col: string, vs: any[]) { filters.push(`in:${col}=${vs.join('|')}`); preds.push((r) => vs.includes(r[col])); return q },
        then(res: any, rej: any) { return exec().then(res, rej) },
      }
      return q
    },
  }
}
