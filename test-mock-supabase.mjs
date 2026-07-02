// test-mock-supabase.mjs
// Simulates the relevant Supabase calls in-memory so we can exercise the
// exact logic added to route__7_.ts (create-school) and the fixed query in
// page_tsx__18 (subscription page), without needing a live Supabase project.

const db = {
  schools: new Map(),
  subscriptions: new Map(), // keyed by school_id
}

let assertions = 0
let failures = []

function assert(desc, cond) {
  assertions++
  if (!cond) failures.push(desc)
  console.log(`${cond ? 'PASS' : 'FAIL'} - ${desc}`)
}

// ── Minimal mock of the chainable supabase-js query builder we need ───────
function makeClient() {
  return {
    from(table) {
      return {
        insert(row) {
          const id = `school_${db.schools.size + 1}`
          const record = { id, ...row }
          db.schools.set(id, record)
          return {
            select() { return this },
            single: async () => ({ data: record, error: null }),
          }
        },
        upsert(row, opts) {
          const key = row[opts.onConflict]
          db[table].set(key, { ...row })
          return Promise.resolve({ data: row, error: null })
        },
        select(cols) {
          const state = { table, filters: {}, order: null, limitN: null }
          const api = {
            eq(col, val) { state.filters[col] = val; return api },
            order() { return api },
            limit(n) { state.limitN = n; return api },
            single: async () => query(state, true),
            maybeSingle: async () => query(state, false),
          }
          return api
        },
      }
    },
  }

  function query(state, strictSingle) {
    const rows = [...db[state.table].values()].filter(r =>
      Object.entries(state.filters).every(([k, v]) => r[k] === v)
    )
    if (rows.length === 0) {
      if (strictSingle) {
        // supabase .single() with 0 rows returns an error, not a throw
        return { data: null, error: { message: 'No rows found' } }
      }
      return { data: null, error: null } // .maybeSingle()
    }
    return { data: rows[0], error: null }
  }
}

// ── Simulate the FIXED create-school subscription-seeding block ──────────
async function simulateCreateSchool(adminSupabase, { setupType, paymentAmount, paymentRef }) {
  const now = new Date()
  const trialEnd = new Date(now.getTime() + 10 * 86400000)
  const freeMonthEnd = new Date(now.getTime() + 30 * 86400000)

  const { data: school } = await adminSupabase.from('schools').insert({
    name: 'Test Academy',
    setup_status: setupType === 'trial' ? 'trial' : 'active',
    subscription_plan: setupType === 'permanent' ? 'free_month' : null,
    subscription_starts: setupType === 'permanent' ? now.toISOString() : null,
    subscription_ends: setupType === 'permanent' ? freeMonthEnd.toISOString() : null,
  }).select('id, slug').single()

  if (setupType === 'trial') {
    await adminSupabase.from('subscriptions').upsert({
      school_id: school.id,
      plan_type: 'trial',
      status: 'Active',
      billing_cycle: 'Trial',
      started_at: now.toISOString().split('T')[0],
      expiry_date: trialEnd.toISOString().split('T')[0],
      amount_paid: 0,
      currency_used: 'NGN',
    }, { onConflict: 'school_id' })
  } else {
    await adminSupabase.from('subscriptions').upsert({
      school_id: school.id,
      plan_type: 'free_month',
      status: 'Active',
      billing_cycle: 'Monthly',
      started_at: now.toISOString().split('T')[0],
      expiry_date: freeMonthEnd.toISOString().split('T')[0],
      amount_paid: setupType === 'permanent' ? (paymentAmount ?? 0) : 0,
      currency_used: 'NGN',
      payment_reference: setupType === 'permanent' ? (paymentRef ?? null) : null,
    }, { onConflict: 'school_id' })
  }

  return school
}

// ── Simulate the FIXED subscription page read ─────────────────────────────
async function simulateSubscriptionPageRead(supabase, schoolId) {
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return subscription
}

// ── OLD (buggy) read, for comparison ───────────────────────────────────────
async function simulateOldBuggyRead(supabase, schoolId) {
  const { data: subscription, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('school_registry_id', schoolId) // <- the bug
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  return { subscription, error }
}

function daysRemaining(subscription) {
  if (!subscription?.expiry_date) return 0
  const expiry = new Date(subscription.expiry_date)
  const now = new Date()
  return Math.max(0, Math.floor((expiry.getTime() - now.getTime()) / 86400000))
}

// ── TEST 1: permanent setup gets a free-month subscription row ────────────
async function test1() {
  console.log('\n--- Test 1: permanent setup school gets a 30-day free-month subscription row ---')
  const admin = makeClient()
  const school = await simulateCreateSchool(admin, { setupType: 'permanent', paymentAmount: 150000, paymentRef: 'REF123' })

  const sub = await simulateSubscriptionPageRead(admin, school.id)
  assert('subscription row exists after create-school (permanent)', !!sub)
  assert('plan_type is free_month', sub?.plan_type === 'free_month')
  assert('status is Active', sub?.status === 'Active')
  const days = daysRemaining(sub)
  assert(`daysRemaining is ~30 (got ${days})`, days >= 29 && days <= 30)
  assert('daysRemaining is NOT 0 (old bug symptom)', days !== 0)
}

// ── TEST 2: trial setup gets a trial subscription row ──────────────────────
async function test2() {
  console.log('\n--- Test 2: trial setup school gets a 10-day trial subscription row ---')
  const admin = makeClient()
  const school = await simulateCreateSchool(admin, { setupType: 'trial' })

  const sub = await simulateSubscriptionPageRead(admin, school.id)
  assert('subscription row exists after create-school (trial)', !!sub)
  assert('plan_type is trial', sub?.plan_type === 'trial')
  const days = daysRemaining(sub)
  assert(`daysRemaining is ~10 (got ${days})`, days >= 9 && days <= 10)
}

// ── TEST 3: old buggy column name would have found nothing ────────────────
async function test3() {
  console.log('\n--- Test 3: reproduce the OLD bug (school_registry_id) to confirm it was broken ---')
  const admin = makeClient()
  const school = await simulateCreateSchool(admin, { setupType: 'permanent', paymentAmount: 150000 })

  const { subscription, error } = await simulateOldBuggyRead(admin, school.id)
  assert('OLD query finds NO subscription (reproduces the reported bug)', !subscription)
  assert('OLD query returns a "No rows found" error from .single()', error?.message === 'No rows found')
  const days = daysRemaining(subscription)
  assert('OLD code path would show daysRemaining = 0 / "Expired" immediately', days === 0)
}

// ── TEST 4: fixed query still works when literally zero rows exist ────────
// (e.g. a school created before this fix, or the insert failing silently)
async function test4() {
  console.log('\n--- Test 4: fixed read on a school with NO subscription row does not throw ---')
  const admin = makeClient()
  const { data: school } = await admin.from('schools').insert({ name: 'Legacy School' }).select('id').single()

  let threw = false
  let sub
  try {
    sub = await simulateSubscriptionPageRead(admin, school.id)
  } catch {
    threw = true
  }
  assert('maybeSingle() does not throw on zero rows', !threw)
  assert('subscription is null (page can render "no active subscription" gracefully)', sub === null || sub === undefined)
}

async function run() {
  await test1()
  await test2()
  await test3()
  await test4()

  console.log(`\n${assertions - failures.length}/${assertions} assertions passed`)
  if (failures.length) {
    console.log('FAILURES:')
    failures.forEach(f => console.log(' - ' + f))
    process.exit(1)
  } else {
    console.log('All tests passed.')
  }
}

run()
