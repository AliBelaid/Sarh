# Sijilli — Supabase

This folder is the source of truth for the database schema, RLS policies,
storage buckets, and edge functions.

## Layout

```
infra/supabase/
├── config.toml          # local dev config (port 54321 API, 54322 Postgres)
├── seed.sql             # dev-only seed data (municipalities, etc.)
├── migrations/          # numbered SQL migrations, run in order
│   ├── 001_extensions.sql
│   ├── 002_lookup.sql
│   ├── 003_citizens.sql
│   ├── 004_digital_id.sql
│   ├── 005_officers.sql
│   ├── 006_properties.sql
│   ├── 007_documents.sql
│   ├── 008_workflow.sql
│   ├── 009_ssi.sql
│   ├── 010_notifications.sql
│   ├── 011_audit.sql
│   ├── 012_views.sql
│   ├── 013_functions.sql
│   ├── 014_triggers.sql
│   ├── 015_rls.sql
│   └── 016_seed_regions.sql
└── functions/           # Deno edge functions (Phase 5+)
```

## Running locally

```sh
# 1. Install Supabase CLI (Windows: scoop install supabase)
# 2. From repo root:
supabase init        # one-time, only if .supabase/ is missing
supabase start       # spins up Postgres + Studio + Auth + Storage
supabase db reset    # applies all migrations and seed.sql
```

After `supabase db reset`, regenerate the Prisma client:

```sh
cd apps/api
pnpm prisma:pull
pnpm prisma:generate
```

## Migration discipline

- Migrations are **append-only**. Never edit a numbered file once it has
  been applied to staging or production — write a new `017_*.sql` instead.
- Use `supabase db diff -f new_migration_name` to capture schema drift.
- Every new migration must be checked against the constraints in
  `CLAUDE.md` (RLS, audit log append-only, no hard deletes, etc.).
