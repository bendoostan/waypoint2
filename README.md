# Waypoint

A goal-backward points/miles travel planner: a deterministic optimization
engine over a knowledge graph of credit cards, currencies, transfer partners,
and award routes. See `PLAN.md` for the architecture and roadmap, and
`CLAUDE.md` for day-to-day conventions.

## Local setup

Prerequisites: Node 22+, [pnpm](https://pnpm.io) 10+, Docker (for local
Supabase).

1. `git clone <this repo> && cd waypoint`
2. `pnpm install`
3. `cp .env.example .env.local` — the committed values are the standard
   local-dev defaults printed by `supabase start`; nothing to edit for local
   work
4. `pnpm exec supabase start` — boots local Postgres/Auth/Studio in Docker
   (first run downloads images; compare the printed URL/keys with
   `.env.local` if anything fails to connect)
5. `pnpm exec supabase db reset` — applies all migrations from zero
6. `pnpm seed` — idempotent: loads ~4,000 airports from OurAirports plus the
   seed reference graph (currencies, cards, transfer edges, award routes)
7. `pnpm db:types` — regenerates `src/types/database.ts` (should produce no
   diff on a fresh clone)
8. `pnpm test` — Vitest, including seed referential-integrity checks
9. `pnpm dev` — app on http://localhost:3000; sign in at `/login` with any
   email and grab the one-time code from Mailpit at http://127.0.0.1:54324
10. Optional: make yourself admin —
    `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c
"update profiles set role = 'admin';"` (after your first sign-in)

## Using a hosted Supabase project (no Docker)

No Docker available? Point the app at a real (free) Supabase project instead
of the local stack. Everything that talks to Postgres — migrations, seed,
type generation — reads its connection info from environment variables, so
nothing here is hardcoded to `supabase start`.

1. Create a free project at [supabase.com](https://supabase.com) (any
   region; the free tier is enough for this).
2. Grab three values from the dashboard:
   - **Project URL** and **anon public key** — Project Settings -> API
   - **Connection string** — Project Settings -> Database -> Connection
     string. Prefer the direct connection (URI); it already includes
     `?sslmode=require` — keep that. Note the direct host
     (`db.<ref>.supabase.co`) is IPv6-only: if your network lacks IPv6
     (`psql` fails with "network unreachable"), switch the dashboard
     dropdown to **Session pooler** and use that URI instead (IPv4, port
     5432, username `postgres.<ref>`) — it works fine for migrations and
     seed. Avoid the transaction pooler (port 6543) for migrations.
3. `cp .env.example .env.local`, then replace `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `DATABASE_URL` with those three
   values. Leave `SUPABASE_SERVICE_ROLE_KEY` as-is (unused for this flow) or
   fill it in from the same API settings page if you want it for later.
4. `pnpm install`
5. `pnpm db:migrate` — applies `supabase/migrations/*.sql` in order against
   `DATABASE_URL`. This is the Docker-less equivalent of
   `supabase db reset`; do **not** run `scripts/ci/supabase-shim.sql` first —
   that shim fakes Supabase's auth schema/roles for plain Postgres in CI, and
   a real Supabase project already has them for real.
6. `pnpm seed` — same idempotent seed as local, now writing to your hosted
   project.
7. `pnpm db:types` — regenerates `src/types/database.ts` from the hosted
   schema (should match what's already committed, since migrations are
   frozen once merged).
8. `pnpm dev` — the app now talks to your hosted project. Sign in at
   `/login`; the one-time code arrives via Supabase's built-in auth email
   (check the inbox for the address you used, including spam) rather than
   the local Mailpit inbox.
9. Make yourself admin — either via the Supabase dashboard's SQL editor, or:
   `psql "$DATABASE_URL" -c "update profiles set role = 'admin';"` (after
   your first sign-in, so the profile row exists).

Skip `pnpm exec supabase start` entirely in this flow — it's Docker-only and
not needed once `DATABASE_URL` points at a hosted project.

## Scripts

| Script                                         | Purpose                                               |
| ---------------------------------------------- | ----------------------------------------------------- |
| `pnpm dev` / `pnpm build` / `pnpm start`       | Next.js                                               |
| `pnpm db:migrate`                              | Apply migrations against `DATABASE_URL` (Docker-less) |
| `pnpm seed`                                    | Seed the DB at `DATABASE_URL` (safe to rerun)         |
| `pnpm db:types`                                | Regenerate DB types from `DATABASE_URL`'s schema      |
| `pnpm test`                                    | Run tests once (`pnpm test:watch` to watch)           |
| `pnpm lint` / `pnpm typecheck` / `pnpm format` | Hygiene                                               |

## Repository layout

```
supabase/migrations/   0001_reference, 0002_users, 0003_pipeline
scripts/seed/          typed seed data + idempotent runner
scripts/ci/            supabase-shim.sql for Docker-less verification
src/lib/supabase/      typed client helpers (client/server/middleware)
src/types/database.ts  generated — never edit by hand
src/app/               login, auth confirm, (app)/dashboard
```

## CI

`.github/workflows/ci.yml` runs lint, format check, typecheck, and tests,
then proves the migrations apply from zero on a fresh Postgres 16 (via the
auth shim), runs the seed against it, and fails if `pnpm db:types` would
produce a diff.
