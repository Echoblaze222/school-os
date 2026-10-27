-- sql/migrations/2026-10-27-ndpa-compliance.sql
--
-- Data-protection (NDPA 2023) tooling for schools: DPO + registration
-- details, parental consent register, data-subject-request log and a breach
-- register with the 72-hour NDPC clock.
--
-- Additive and idempotent: safe to run more than once. Run it in the Supabase
-- SQL editor BEFORE deploying /dashboard/principal/data-protection, otherwise
-- that page shows a "not set up yet" message instead of data.
--
-- Access model: RLS is ENABLED with NO policies, so the anon/authenticated
-- roles can read and write nothing directly. Every access goes through
-- /api/principal/data-protection/*, which verifies the caller (principal or
-- secretary), derives the school from the caller's own profile, and uses the
-- service role scoped to that school. These tables hold sensitive records
-- (breaches, requests about children), so deny-by-default is intentional.

create table if not exists public.school_data_protection (
  school_id                   uuid primary key references public.schools(id) on delete cascade,
  dpo_name                    text,
  dpo_email                   text,
  dpo_phone                   text,
  ndpc_registration_number    text,
  -- The processing year the most recent Compliance Audit Return covered
  -- (a return filed in 2026 covers 2025).
  last_audit_return_year      integer,
  last_audit_return_filed_on  date,
  privacy_notice_published_on date,
  updated_by                  uuid references auth.users(id) on delete set null,
  updated_at                  timestamptz not null default now()
);

create table if not exists public.parental_consents (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references public.schools(id) on delete cascade,
  student_id    uuid not null references public.profiles(id) on delete cascade,
  consent_type  text not null
                check (consent_type in ('data_processing','photo_media','biometric','ai_features')),
  granted       boolean not null,
  method        text not null default 'paper'
                check (method in ('paper','in_person','portal')),
  guardian_name text,
  notes         text,
  recorded_by   uuid references auth.users(id) on delete set null,
  recorded_at   timestamptz not null default now(),
  unique (student_id, consent_type)
);
create index if not exists parental_consents_school_idx
  on public.parental_consents (school_id, consent_type);

create table if not exists public.data_subject_requests (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references public.schools(id) on delete cascade,
  requester_name   text not null,
  requester_contact text,
  student_id       uuid references public.profiles(id) on delete set null,
  request_type     text not null
                   check (request_type in ('access','correction','deletion','objection','portability')),
  details          text,
  status           text not null default 'open'
                   check (status in ('open','in_progress','completed','rejected')),
  received_on      date not null default current_date,
  -- Internal target, defaulted by the app to 30 days. Confirm the statutory
  -- response time with your DPO / lawyer and adjust per request if needed.
  due_on           date not null,
  resolution_notes text,
  resolved_at      timestamptz,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now()
);
create index if not exists data_subject_requests_school_idx
  on public.data_subject_requests (school_id, status, due_on);

create table if not exists public.data_breach_register (
  id                      uuid primary key default gen_random_uuid(),
  school_id               uuid not null references public.schools(id) on delete cascade,
  occurred_at             timestamptz,
  -- The NDPC 72-hour notification clock runs from here (when the school
  -- became aware of the breach).
  discovered_at           timestamptz not null default now(),
  description             text not null,
  data_affected           text,
  people_affected         integer check (people_affected is null or people_affected >= 0),
  risk_level              text not null default 'medium'
                          check (risk_level in ('low','medium','high')),
  actions_taken           text,
  ndpc_notified_at        timestamptz,
  individuals_notified_at timestamptz,
  status                  text not null default 'open'
                          check (status in ('open','contained','closed')),
  created_by              uuid references auth.users(id) on delete set null,
  created_at              timestamptz not null default now()
);
create index if not exists data_breach_register_school_idx
  on public.data_breach_register (school_id, discovered_at desc);

alter table public.school_data_protection enable row level security;
alter table public.parental_consents      enable row level security;
alter table public.data_subject_requests  enable row level security;
alter table public.data_breach_register   enable row level security;
