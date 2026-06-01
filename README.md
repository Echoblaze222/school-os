# School Portal — Layer 2: Auth & Onboarding

## What This Is
The complete login and 3-stage onboarding system. No UI design — pure logic and security.

---

## File Structure
```
src/
├── app/
│   ├── layout.tsx                      Root layout
│   ├── dashboard/page.tsx              Placeholder (Layer 3 replaces this)
│   ├── login/page.tsx                  Stage 1 — code + password login
│   ├── onboarding/
│   │   ├── stage-2/page.tsx            Stage 2 — identity setup + password change
│   │   └── stage-3/page.tsx            Stage 3 — document upload
│   └── api/
│       └── onboarding/
│           ├── stage-2/route.ts        Server: hash identifier, update password
│           └── stage-3/route.ts        Server: save storage paths, complete onboarding
├── lib/
│   ├── types.ts                        TypeScript types matching the DB schema
│   └── supabase/
│       ├── client.ts                   Browser Supabase client
│       ├── server.ts                   Server Supabase client (cookies)
│       └── admin.ts                    Admin client (service role — server only)
└── middleware.ts                       Route guard — enforces onboarding stages
```

---

## Setup Instructions

### 1. Install dependencies
```bash
npm install
```

### 2. Create your environment file
```bash
cp .env.example .env.local
```
Then fill in your three Supabase values from your project's Settings > API page.

### 3. Create Storage buckets in Supabase
Go to your Supabase dashboard > Storage > New bucket:

| Bucket name    | Public? |
|----------------|---------|
| `passports`    | NO      |
| `nin-documents`| NO      |

Both must be **private**.

### 4. Add Storage RLS policies
In Supabase > Storage > passports > Policies, add:

**Upload policy** (INSERT):
```sql
(auth.uid()::text = (storage.foldername(name))[1])
```

**Download policy** (SELECT):
```sql
(auth.uid()::text = (storage.foldername(name))[1])
```

Repeat the same two policies for the `nin-documents` bucket.

This ensures users can only upload to and read from their own folder.

### 5. Add profiles RLS policy for default_code lookup
The login page needs to look up a profile by default_code before the user is authenticated.
Add this policy in Supabase > Table Editor > profiles > RLS:

**Policy name:** Allow default_code lookup
**Operation:** SELECT
**Expression:**
```sql
true
```
**With check:** Leave empty

> Note: This allows unauthenticated reads of the profiles table.
> To tighten this, move the default_code lookup to an API route using the admin client instead.

### 6. Run the development server
```bash
npm run dev
```

Open http://localhost:3000 — it will redirect to /login.

---

## How to Create a Test User

In Supabase > Authentication > Users, create a user manually:
- Email: `test@school.com`
- Password: `temppass123`

Then in Table Editor > profiles, insert a row:
```
id: (copy the UUID from the Auth user you just created)
role: student
full_name: Amara Johnson
email: test@school.com
default_code: SCH-2024-0001
onboarding_stage: stage_1_pending
```

Now go to http://localhost:3000/login and enter:
- Access code: `SCH-2024-0001`
- Password: `temppass123`

You should be walked through all 3 stages.

---

## The Onboarding Flow

```
/login
  ↓ (correct code + password)
/onboarding/stage-2
  ↓ (3 letters + PIN + new password)
/onboarding/stage-3
  ↓ (passport photo + NIN screenshot uploaded)
/dashboard ← Layer 3 builds this out
```

The middleware enforces this — no stage can be skipped by URL.
