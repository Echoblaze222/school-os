-- Storage bucket hardening (free, reversible). Nov 11, 2026.
-- APPLIED to production on Nov 11, 2026 (steps 1 to 3 below). Kept for the record.
--
-- Why: 7 public buckets had no file size limit. Anyone with an upload
-- permission could fill the 1 GB Free storage quota or the 5 GB egress quota.
-- Limits are deliberately generous so no current upload path breaks.
-- Tighten them after client-side image compression ships.

-- 1. Image-only buckets: 8 MB, images only (phone photos are often 3 to 6 MB).
update storage.buckets
set file_size_limit = 8 * 1024 * 1024,
    allowed_mime_types = array['image/*']
where id in ('passports', 'school-assets');

-- 2. Document buckets: 25 MB, no type restriction yet.
update storage.buckets
set file_size_limit = 25 * 1024 * 1024
where id in ('notes', 'syllabus', 'school_docs');

-- 3. Buckets that may hold zip or mp4 attachments: 50 MB.
-- 50 MB is also the Free plan's global per-file ceiling.
update storage.buckets
set file_size_limit = 50 * 1024 * 1024
where id in ('assignments', 'school-files');

-- ROLLBACK (restores the previous no-limit state):
-- update storage.buckets
-- set file_size_limit = null, allowed_mime_types = null
-- where id in ('passports', 'school-assets', 'notes', 'syllabus', 'school_docs', 'assignments', 'school-files');

-- NOT APPLIED: the `passports` bucket is public although README.md says it
-- should be private. Current onboarding (src/app/onboarding/stage-3/page.tsx)
-- uploads passport photos into the PUBLIC `avatars` bucket under `passports/`
-- (10 objects in Nov 2026), so making the bucket private alone does not fix it.
-- It needs a code change (private bucket plus signed URLs) and a one-time move
-- of the existing files.
