-- =====================================================================
-- C1-A (ADDITIVE): server-only activation credentials + student link codes
--
-- Status: NOT APPLIED. Apply BEFORE merging/deploying the C1 application code
-- (the new code calls these functions). Nothing here changes existing
-- behavior: it only adds tables, functions and one trigger, so the currently
-- deployed code keeps working until the new code goes out.
--
-- Design:
--   * profiles.default_code stays a NON-secret identifier (display + code-signin).
--   * Activation now needs a separate random token. Only its SHA-256 hash is
--     stored, it is single-use, expiring, tied to exactly one profile, and it
--     is revoked automatically if that user's password changes.
--   * Parent linking now needs a separate per-student link code (also hashed).
--   * Both tables have RLS enabled with NO policies and all client grants
--     revoked; the functions are executable by service_role only.
--
-- Dry-run: this exact SQL plus a test script was executed inside a
-- transaction that was rolled back (see docs/security-remediation/C1-activation-credentials.md).
-- =====================================================================

create schema if not exists private;

-- ---------------------------------------------------------------------
-- activation_credentials
-- ---------------------------------------------------------------------
create table if not exists public.activation_credentials (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  school_id      uuid references public.schools(id) on delete cascade,
  token_hash     text not null,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null,
  used_at        timestamptz,
  revoked_at     timestamptz,
  revoked_reason text,
  constraint activation_credentials_hash_format check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint activation_credentials_expiry_after_creation check (expires_at > created_at)
);

create unique index if not exists activation_credentials_token_hash_key
  on public.activation_credentials (token_hash);
-- At most one live credential per account.
create unique index if not exists activation_credentials_one_active_per_user
  on public.activation_credentials (user_id) where used_at is null and revoked_at is null;
create index if not exists activation_credentials_school_id_idx on public.activation_credentials (school_id);
create index if not exists activation_credentials_created_by_idx on public.activation_credentials (created_by);

alter table public.activation_credentials enable row level security;
revoke all on public.activation_credentials from public, anon, authenticated;
comment on table public.activation_credentials is
  'Server-only. Hashed, single-use, expiring account-activation tokens. No RLS policies on purpose: only service_role (via the functions below) may touch it.';

-- ---------------------------------------------------------------------
-- student_link_codes (parent -> child linking secret, separate from default_code)
-- ---------------------------------------------------------------------
create table if not exists public.student_link_codes (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.profiles(id) on delete cascade,
  school_id    uuid not null references public.schools(id) on delete cascade,
  code_hash    text not null,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  revoked_at   timestamptz,
  last_used_at timestamptz,
  use_count    integer not null default 0,
  constraint student_link_codes_hash_format check (code_hash ~ '^[0-9a-f]{64}$'),
  constraint student_link_codes_expiry_after_creation check (expires_at > created_at)
);

create unique index if not exists student_link_codes_code_hash_key on public.student_link_codes (code_hash);
create unique index if not exists student_link_codes_one_active_per_student
  on public.student_link_codes (student_id) where revoked_at is null;
create index if not exists student_link_codes_school_id_idx on public.student_link_codes (school_id);
create index if not exists student_link_codes_created_by_idx on public.student_link_codes (created_by);

alter table public.student_link_codes enable row level security;
revoke all on public.student_link_codes from public, anon, authenticated;
comment on table public.student_link_codes is
  'Server-only. Hashed per-student codes a parent presents to link to a child. Multi-use until expiry or rotation (a child can have two parents).';

-- ---------------------------------------------------------------------
-- Functions (SECURITY DEFINER, service_role only)
-- ---------------------------------------------------------------------
create or replace function public.issue_activation_credential(
  p_user_id uuid, p_token_hash text, p_created_by uuid default null, p_ttl_hours integer default 168
) returns timestamptz
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_school uuid; v_stage text; v_expires timestamptz;
begin
  if p_ttl_hours is null or p_ttl_hours < 1 or p_ttl_hours > 720 then
    raise exception 'invalid activation ttl' using errcode = '22023';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid token hash' using errcode = '22023';
  end if;
  select school_id, onboarding_stage into v_school, v_stage from public.profiles where id = p_user_id;
  if not found then raise exception 'profile not found' using errcode = 'P0002'; end if;
  -- A credential can only exist for an account that has not been activated yet.
  if v_stage is null or v_stage not in ('start', 'stage_1_pending') then
    raise exception 'account is already activated' using errcode = '55000';
  end if;
  -- Supersede any live credential so there is never more than one.
  update public.activation_credentials set revoked_at = now(), revoked_reason = 'superseded'
   where user_id = p_user_id and used_at is null and revoked_at is null;
  v_expires := now() + make_interval(hours => p_ttl_hours);
  insert into public.activation_credentials (user_id, school_id, token_hash, created_by, expires_at)
  values (p_user_id, v_school, p_token_hash, p_created_by, v_expires);
  return v_expires;
end $$;

-- Atomically claims a credential. Returns the profile id, or NULL when the
-- token is unknown, expired, used, revoked, for an already-activated account,
-- or (when p_school_id is given) belongs to a different school. The caller
-- gets the same NULL in every failure case so nothing is revealed.
create or replace function public.consume_activation_credential(p_token_hash text, p_school_id uuid default null)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_user uuid;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then return null; end if;
  update public.activation_credentials ac set used_at = now()
    from public.profiles p
   where ac.token_hash = p_token_hash
     and ac.used_at is null and ac.revoked_at is null and ac.expires_at > now()
     and p.id = ac.user_id
     and p.onboarding_stage in ('start', 'stage_1_pending')
     and (p_school_id is null or p.school_id = p_school_id)
  returning ac.user_id into v_user;
  return v_user;
end $$;

-- Used only when setting the password fails right after a successful claim,
-- so the user is not locked out by a transient error.
create or replace function public.release_activation_credential(p_user_id uuid, p_token_hash text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.activation_credentials set used_at = null
   where user_id = p_user_id and token_hash = p_token_hash and revoked_at is null and used_at is not null;
end $$;

-- A credential must not outlive the moment a password is established.
create or replace function public.revoke_activation_on_password_change()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.activation_credentials set revoked_at = now(), revoked_reason = 'password_changed'
   where user_id = new.id and used_at is null and revoked_at is null;
  return new;
end $$;

drop trigger if exists revoke_activation_on_password_change on auth.users;
create trigger revoke_activation_on_password_change
  after update of encrypted_password on auth.users
  for each row when (old.encrypted_password is distinct from new.encrypted_password)
  execute function public.revoke_activation_on_password_change();

create or replace function public.issue_student_link_code(
  p_student_id uuid, p_code_hash text, p_created_by uuid default null, p_ttl_days integer default 30
) returns timestamptz
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_school uuid; v_role text; v_expires timestamptz;
begin
  if p_ttl_days is null or p_ttl_days < 1 or p_ttl_days > 90 then
    raise exception 'invalid link code ttl' using errcode = '22023';
  end if;
  if p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid code hash' using errcode = '22023';
  end if;
  select school_id, role into v_school, v_role from public.profiles where id = p_student_id;
  if not found or v_role is distinct from 'student' or v_school is null then
    raise exception 'student not found' using errcode = 'P0002';
  end if;
  update public.student_link_codes set revoked_at = now() where student_id = p_student_id and revoked_at is null;
  v_expires := now() + make_interval(days => p_ttl_days);
  insert into public.student_link_codes (student_id, school_id, code_hash, created_by, expires_at)
  values (p_student_id, v_school, p_code_hash, p_created_by, v_expires);
  return v_expires;
end $$;

-- Preview step for the parent UI: which student does this code point to (same school only)?
create or replace function public.resolve_student_link_code(p_code_hash text, p_school_id uuid)
returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select c.student_id
    from public.student_link_codes c
    join public.profiles s on s.id = c.student_id
   where c.code_hash = p_code_hash and c.revoked_at is null and c.expires_at > now()
     and c.school_id = p_school_id and s.school_id = p_school_id and s.role = 'student'
$$;

-- Links a parent to the student behind a valid code. NULL on any failure.
create or replace function public.link_parent_by_code(p_parent_id uuid, p_code_hash text)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_school uuid; v_role text; v_student uuid; v_code uuid;
begin
  select school_id, role into v_school, v_role from public.profiles where id = p_parent_id;
  if not found or v_role is distinct from 'parent' or v_school is null then return null; end if;
  select c.id, c.student_id into v_code, v_student
    from public.student_link_codes c
    join public.profiles s on s.id = c.student_id
   where c.code_hash = p_code_hash and c.revoked_at is null and c.expires_at > now()
     and c.school_id = v_school and s.school_id = v_school and s.role = 'student';
  if v_student is null then return null; end if;
  insert into public.parent_student_links (parent_id, student_id) values (p_parent_id, v_student) on conflict do nothing;
  update public.student_link_codes set use_count = use_count + 1, last_used_at = now() where id = v_code;
  return v_student;
end $$;

-- ---------------------------------------------------------------------
-- Grants: service_role only. The trigger function is also granted to
-- supabase_auth_admin so Auth's password updates can never fail on a
-- permissions check.
-- ---------------------------------------------------------------------
revoke all on function public.issue_activation_credential(uuid, text, uuid, integer) from public, anon, authenticated;
revoke all on function public.consume_activation_credential(text, uuid) from public, anon, authenticated;
revoke all on function public.release_activation_credential(uuid, text) from public, anon, authenticated;
revoke all on function public.revoke_activation_on_password_change() from public, anon, authenticated;
revoke all on function public.issue_student_link_code(uuid, text, uuid, integer) from public, anon, authenticated;
revoke all on function public.resolve_student_link_code(text, uuid) from public, anon, authenticated;
revoke all on function public.link_parent_by_code(uuid, text) from public, anon, authenticated;

grant execute on function public.issue_activation_credential(uuid, text, uuid, integer) to service_role;
grant execute on function public.consume_activation_credential(text, uuid) to service_role;
grant execute on function public.release_activation_credential(uuid, text) to service_role;
grant execute on function public.revoke_activation_on_password_change() to supabase_auth_admin;
grant execute on function public.issue_student_link_code(uuid, text, uuid, integer) to service_role;
grant execute on function public.resolve_student_link_code(text, uuid) to service_role;
grant execute on function public.link_parent_by_code(uuid, text) to service_role;
