-- ============================================================
-- MIGRATION: Ensure syllabus table has school_id (RLS fix)
-- Run this in Supabase SQL Editor if you haven't already.
-- ============================================================

-- 1. Make file_url nullable (already in previous migration)
ALTER TABLE syllabus
  ALTER COLUMN file_url DROP NOT NULL;

-- 2. Add school_id to syllabus table if missing (required for RLS)
ALTER TABLE syllabus
  ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id) ON DELETE CASCADE;

-- 3. Add school_id to syllabus_topics if missing
ALTER TABLE syllabus_topics
  ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id) ON DELETE CASCADE;

-- 4. Ensure online_classes table has the required columns
ALTER TABLE online_classes
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ended_at   TIMESTAMPTZ;

-- ============================================================
-- Done. Deploy the updated SyllabusClient.tsx after running.
-- ============================================================
