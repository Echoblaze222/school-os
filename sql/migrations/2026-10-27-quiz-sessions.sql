-- sql/migrations/2026-10-27-quiz-sessions.sql
--
-- Server-side quiz attempts. Starting a quiz now creates a row here, so the
-- server (not the student's browser) knows when the attempt began, how many
-- attempts have been used, and whether time has run out.
--
-- Additive and idempotent. Run in the Supabase SQL editor BEFORE deploying
-- the server-graded quiz flow, otherwise starting a quiz shows a "not set up
-- yet" message.
--
-- Access model: RLS enabled with NO policies; only /api/student/quizzes/[id]
-- (service role) reads or writes this table.
--
-- Assumes public.quizzes.id is a uuid. If that statement errors on the
-- foreign key, tell me the column type and I'll adjust.

create table if not exists public.quiz_sessions (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references public.schools(id) on delete cascade,
  quiz_id      uuid not null references public.quizzes(id) on delete cascade,
  student_id   uuid not null references public.profiles(id) on delete cascade,
  started_at   timestamptz not null default now(),
  submitted_at timestamptz
);

create index if not exists quiz_sessions_quiz_student_idx
  on public.quiz_sessions (quiz_id, student_id);

-- At most one OPEN attempt per student per quiz (stops double-starts racing).
create unique index if not exists quiz_sessions_one_open
  on public.quiz_sessions (quiz_id, student_id)
  where submitted_at is null;

alter table public.quiz_sessions enable row level security;
