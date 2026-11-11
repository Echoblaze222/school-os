# DB backup runbook (free tier)

Status: written Nov 11, 2026, **not yet run**. The first manual run and a restore drill are part of the setup. Expect to fix small things on the first attempt.

Why this exists: the Supabase project is on the Free plan, which has no automatic backups and no point-in-time recovery. This job gives a nightly, encrypted copy of the database in Backblaze B2. Cost: $0 while under B2's free 10 GB (the DB was 58 MB in Nov 2026). Upgrading to Supabase Pro later adds provider backups. Keep this job as a second copy.

## What is and is not backed up

- Backed up: `public` and `auth` schemas (school records, users, password hashes), encrypted.
- **Not backed up:** files in Supabase Storage (about 36 MB in Nov 2026), Realtime state, Edge functions, project settings. Files are a follow-up task.

## One-time setup

1. **Activate the workflow.** Move `docs/ops/backup-db.workflow.yml` to `.github/workflows/backup-db.yml` (the connector that prepared it could not write to that folder).
2. **B2 account and bucket.** Create a Backblaze B2 account. Create a **private** bucket (for example `schoolos-backups`). Note the S3 endpoint shown on the bucket page (for example `https://s3.us-west-004.backblazeb2.com`). If B2 asks for payment details at signup and you cannot add them, use the manual alternative at the end of this file.
3. **Application key.** Create a key restricted to that one bucket with read, write and list access. Save the key ID and key.
4. **Retention (free).** In the bucket's Lifecycle Settings, use a custom rule on the `db/` prefix: hide files after 30 days, delete 1 day after hiding. That keeps about 30 nightly dumps.
5. **Supabase connection string.** Dashboard, Connect, **Session pooler** (not Direct). Replace the password placeholder with your database password. The session pooler works over IPv4, which GitHub runners need.
6. **Passphrase.** Generate 32 or more random characters. Store it in a password manager **and** on paper. If it is lost, the backups cannot be opened.
7. **GitHub secrets** (repository settings): `SUPABASE_DB_URL`, `B2_KEY_ID`, `B2_APP_KEY`, `B2_BUCKET`, `B2_ENDPOINT`, `BACKUP_PASSPHRASE`.
8. **First run.** Actions, "Backup - Nightly DB dump to Backblaze B2", Run workflow. Confirm a file appears in B2 under `db/YYYY/MM/`.

GitHub Actions minutes: a run takes a few minutes. Daily runs are well inside the free allowance for most accounts, but check your plan's included minutes.

## Restore drill (do this before trusting the backup)

Download one `.dump.enc` file from B2, then on your own machine with Docker and PostgreSQL 17 client tools:

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -in schoolos-YYYYMMDDTHHMMSSZ.dump.enc -out db.dump -pass pass:'YOUR_PASSPHRASE'

docker run -d --name restore-test -e POSTGRES_PASSWORD=test -p 5433:5432 postgres:17
sleep 5

URL=postgresql://postgres:test@localhost:5433/postgres
psql "$URL" -c "create role anon nologin; create role authenticated nologin; create role service_role nologin; create schema if not exists extensions; create extension if not exists pgcrypto with schema extensions; create extension if not exists \"uuid-ossp\" with schema extensions;"

pg_restore --no-owner -d "$URL" db.dump

psql "$URL" -c "select count(*) from public.profiles;"
psql "$URL" -c "select count(*) from public.schools;"
```

Compare the counts with production. Record the date and result at the bottom of this file.

Known likely snags: missing extensions or roles on a plain Postgres (create them as above and re-run), and permission errors dumping the `auth` schema. If the dump step fails on `auth`, change the workflow to `--schema=public --table=auth.users --table=auth.identities` and re-test.

## Disaster recovery in short

1. Create a new Supabase project (needs a free project slot or a paid plan).
2. Restore the dump into it with `pg_restore --no-owner`.
3. Re-create storage buckets and policies, re-upload files, update environment variables in Vercel.

## Manual alternative (no B2 account)

On your own machine, weekly: `pg_dump "<session pooler url>" --format=custom --no-owner --no-privileges --schema=public --schema=auth --file=schoolos-$(date +%F).dump`, then encrypt it with the same `openssl` command and keep copies in two places.

## Restore drill log

| Date | Backup file | Result | Notes |
|---|---|---|---|
| | | | |
