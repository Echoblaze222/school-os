-- ============================================================
-- MIGRATION: Update syllabus table to support topic lists
-- Run this in Supabase SQL Editor BEFORE deploying the
-- syllabus upload page.
-- ============================================================

-- 1. Add topics column (JSONB array of topic strings)
ALTER TABLE syllabus
  ADD COLUMN IF NOT EXISTS topics JSONB DEFAULT '[]'::jsonb;

-- 2. Make file_url nullable — teacher can upload either a
--    PDF file OR a topic list, not necessarily both
ALTER TABLE syllabus
  ALTER COLUMN file_url DROP NOT NULL;

-- ============================================================
-- That's it. The syllabus page will now work correctly.
-- ============================================================
