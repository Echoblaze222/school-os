-- sql/migrations/2026-11-22-note-books.sql
--
-- Note books: a teacher creates a BOOK for one subject (e.g. "Chemistry JSS3"),
-- shares it with one or more classes, and adds TOPICS (entries) to it. A topic is
-- either typed/pasted note text or an uploaded PDF/Word/PowerPoint file.
--
-- Additive and idempotent. Does NOT touch public.school_notes (existing loose
-- notes keep working exactly as before). Run in the Supabase SQL editor BEFORE
-- using the Books tab, otherwise the app shows a "not set up yet" message.
--
-- WHY A BOOK IS SHARED WITH CLASSES (promotion logic)
--   student_profiles.class_id is the student's CURRENT class (promotion updates it).
--   A student sees the books shared with their current class. When a student is
--   promoted, the new class's books appear on their own. Books from classes they
--   were in before stay readable under "Earlier classes" (needs the history table
--   below, filled by a trigger, so it works with ANY promotion screen).
--   A teacher who teaches the same subject next session shares the existing book
--   with the new class instead of rewriting it.
--
-- Access model: RLS enabled with NO policies. Only the /api/notebooks routes
-- (service role) read or write these tables, and they check role, school and
-- class membership on every request. Same model as quiz_sessions.

create table if not exists public.note_books (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references public.schools(id) on delete cascade,
  subject_id    uuid references public.subjects(id) on delete set null,
  subject_name  text,                                   -- shown if subject_id is empty or deleted
  title         text not null check (char_length(title) between 1 and 120),
  description   text check (description is null or char_length(description) <= 600),
  cover_color   text check (cover_color is null or cover_color ~ '^#[0-9a-fA-F]{6}$'),
  academic_year text,
  is_published  boolean not null default false,         -- students only see published books
  created_by    uuid not null references public.profiles(id) on delete cascade,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists note_books_school_idx   on public.note_books (school_id, created_at desc);
create index if not exists note_books_creator_idx  on public.note_books (created_by);

-- Which classes can read a book.
create table if not exists public.note_book_classes (
  book_id    uuid not null references public.note_books(id) on delete cascade,
  class_id   uuid not null references public.classes(id) on delete cascade,
  school_id  uuid not null references public.schools(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (book_id, class_id)
);

create index if not exists note_book_classes_class_idx on public.note_book_classes (class_id);

-- Topics inside a book. Exactly one of content / file_url is normally set.
create table if not exists public.note_book_entries (
  id          uuid primary key default gen_random_uuid(),
  book_id     uuid not null references public.note_books(id) on delete cascade,
  school_id   uuid not null references public.schools(id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 160),
  content     text check (content is null or char_length(content) <= 60000),
  file_url    text,
  file_name   text,
  position    integer not null default 0,
  created_by  uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists note_book_entries_book_idx on public.note_book_entries (book_id, position);

-- Which classes a student has been in. Filled automatically whenever
-- student_profiles.class_id changes (promotion, transfer between classes).
create table if not exists public.student_class_history (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.profiles(id) on delete cascade,
  school_id   uuid references public.schools(id) on delete cascade,
  class_id    uuid not null references public.classes(id) on delete cascade,
  ended_at    timestamptz not null default now()
);

create index if not exists student_class_history_student_idx on public.student_class_history (student_id);

create or replace function public.record_student_class_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.class_id is not null and new.class_id is distinct from old.class_id then
    insert into public.student_class_history (student_id, school_id, class_id)
    select old.id, c.school_id, old.class_id
    from public.classes c
    where c.id = old.class_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_record_student_class_change on public.student_profiles;
create trigger trg_record_student_class_change
  after update of class_id on public.student_profiles
  for each row execute function public.record_student_class_change();

alter table public.note_books            enable row level security;
alter table public.note_book_classes     enable row level security;
alter table public.note_book_entries     enable row level security;
alter table public.student_class_history enable row level security;
