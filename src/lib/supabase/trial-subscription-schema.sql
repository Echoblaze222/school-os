-- ============================================================
-- SchoolOS — Trial & Subscription Schema
-- Run this in Supabase SQL Editor
-- ============================================================

-- ── ENUMS ─────────────────────────────────────────────────────
CREATE TYPE school_setup_status AS ENUM (
  'trial',        -- 10-day free trial (manually activated by super admin)
  'active',       -- paid + within free month or paid subscription
  'expired',      -- trial ended without payment
  'suspended',    -- subscription lapsed
  'locked'        -- manually locked by super admin
);

CREATE TYPE subscription_plan AS ENUM (
  'free_month',        -- 1 month free after setup payment
  'basic_500',         -- ₦500/month
  'standard_1000',     -- ₦1,000/month
  'premium_2000',      -- ₦2,000/month
  'installment_3month' -- 3-month installment plan
);

CREATE TYPE payment_type AS ENUM (
  'setup',        -- one-time setup fee
  'subscription', -- monthly subscription
  'installment'   -- installment payment (1 of 3)
);

-- ── ADD COLUMNS TO EXISTING schools TABLE ─────────────────────
ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS slug               TEXT UNIQUE,           -- unique portal URL slug
  ADD COLUMN IF NOT EXISTS setup_status       school_setup_status DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS trial_started_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_ends_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_extended     BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS trial_active_score INT     DEFAULT 0,     -- 0-100, Pius sees this
  ADD COLUMN IF NOT EXISTS setup_paid_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS free_month_starts  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS free_month_ends    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscription_plan  subscription_plan,
  ADD COLUMN IF NOT EXISTS subscription_starts TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscription_ends  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS installment_count  INT DEFAULT 0,         -- 0,1,2,3
  ADD COLUMN IF NOT EXISTS next_payment_due   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS total_students     INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_by_admin   UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS notes              TEXT;                   -- Pius's private notes

-- ── PAYMENTS TABLE ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS school_payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  payment_type    payment_type NOT NULL,
  amount_ngn      NUMERIC(12,2) NOT NULL,
  plan            subscription_plan,
  installment_num INT,                                               -- 1, 2, or 3
  payment_ref     TEXT,                                              -- Paystack/Flutterwave ref
  confirmed_by    UUID REFERENCES profiles(id),                     -- Pius's user ID
  confirmed_at    TIMESTAMPTZ DEFAULT now(),
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ── TRIAL REMINDERS LOG ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS trial_reminders (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  day_trigger INT  NOT NULL,   -- 3, 7, or 9
  sent_at     TIMESTAMPTZ DEFAULT now(),
  channel     TEXT DEFAULT 'notification'   -- 'notification' | 'email' | 'whatsapp'
);

-- ── SUPER ADMIN TABLE ─────────────────────────────────────────
-- Stores Pius's super admin PIN (in addition to normal login)
CREATE TABLE IF NOT EXISTS super_admins (
  id          UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  pin_hash    TEXT NOT NULL,   -- bcrypt hash of 6-digit PIN
  last_login  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ── INDEXES ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_schools_status       ON schools(setup_status);
CREATE INDEX IF NOT EXISTS idx_schools_trial_ends   ON schools(trial_ends_at);
CREATE INDEX IF NOT EXISTS idx_schools_sub_ends     ON schools(subscription_ends);
CREATE INDEX IF NOT EXISTS idx_payments_school      ON school_payments(school_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_schools_slug  ON schools(slug);

-- ── HELPER: generate slug from school name ────────────────────
CREATE OR REPLACE FUNCTION generate_school_slug(school_name TEXT)
RETURNS TEXT AS $$
DECLARE
  base_slug TEXT;
  final_slug TEXT;
  counter   INT := 0;
BEGIN
  base_slug := lower(regexp_replace(school_name, '[^a-zA-Z0-9]', '-', 'g'));
  base_slug := regexp_replace(base_slug, '-+', '-', 'g');
  base_slug := trim(both '-' from base_slug);
  final_slug := base_slug;
  LOOP
    EXIT WHEN NOT EXISTS (SELECT 1 FROM schools WHERE slug = final_slug);
    counter    := counter + 1;
    final_slug := base_slug || '-' || counter;
  END LOOP;
  RETURN final_slug;
END;
$$ LANGUAGE plpgsql;

-- ── CRON JOB: auto-expire trials (run daily via pg_cron) ──────
-- Install pg_cron extension first: CREATE EXTENSION IF NOT EXISTS pg_cron;
-- SELECT cron.schedule('expire-trials', '0 0 * * *', $$
--   UPDATE schools
--   SET setup_status = 'expired'
--   WHERE setup_status = 'trial'
--   AND trial_ends_at < now();
-- $$);

-- ── CRON JOB: auto-expire subscriptions (run daily) ──────────
-- SELECT cron.schedule('expire-subscriptions', '0 1 * * *', $$
--   UPDATE schools
--   SET setup_status = 'suspended'
--   WHERE setup_status = 'active'
--   AND subscription_ends < now()
--   AND subscription_plan != 'free_month';
-- $$);

-- ── RLS POLICIES ─────────────────────────────────────────────
ALTER TABLE school_payments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE trial_reminders  ENABLE ROW LEVEL SECURITY;
ALTER TABLE super_admins     ENABLE ROW LEVEL SECURITY;

-- Only super admins can see payments
CREATE POLICY "super_admin_payments" ON school_payments
  FOR ALL USING (
    EXISTS (SELECT 1 FROM super_admins WHERE id = auth.uid())
  );

-- Only super admins can see trial reminders
CREATE POLICY "super_admin_reminders" ON trial_reminders
  FOR ALL USING (
    EXISTS (SELECT 1 FROM super_admins WHERE id = auth.uid())
  );

-- Only Pius can see/edit super_admins table
CREATE POLICY "super_admin_self" ON super_admins
  FOR ALL USING (id = auth.uid());

-- ── VIEW: school subscription summary (for Pius's dashboard) ──
CREATE OR REPLACE VIEW school_subscription_summary AS
SELECT
  s.id,
  s.name,
  s.slug,
  s.setup_status,
  s.trial_started_at,
  s.trial_ends_at,
  s.trial_active_score,
  EXTRACT(DAY FROM (s.trial_ends_at - now())) AS trial_days_left,
  s.setup_paid_at,
  s.free_month_ends,
  EXTRACT(DAY FROM (s.free_month_ends - now())) AS free_days_left,
  s.subscription_plan,
  s.subscription_ends,
  EXTRACT(DAY FROM (s.subscription_ends - now())) AS sub_days_left,
  s.installment_count,
  s.next_payment_due,
  s.total_students,
  COALESCE(p.total_paid, 0) AS total_paid_ngn,
  s.notes
FROM schools s
LEFT JOIN (
  SELECT school_id, SUM(amount_ngn) AS total_paid
  FROM school_payments
  GROUP BY school_id
) p ON p.school_id = s.id;

-- Grant view access to authenticated users (filtered by RLS)
GRANT SELECT ON school_subscription_summary TO authenticated;
