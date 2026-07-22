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

## Deploy to Vercel

The app is a standard Next.js 15 app — Vercel auto-detects the framework,
runs `pnpm install` then `pnpm build`, and serves `.next`. No `vercel.json`
is needed (there are no custom routes, headers, rewrites, crons, or regions),
so none is committed. Deploying the app does **not** touch the database:
`next build` never connects to Postgres, runs no migrations, and needs
neither Docker nor the Supabase CLI.

### 1. Point a Supabase project at it first

Follow "Using a hosted Supabase project" above through `pnpm db:migrate` and
`pnpm seed` — run once from any machine with `psql` and this repo, against
your project's connection string. **Vercel never runs migrations or the
seed**, so the schema and data must already exist before (or shortly after)
the first deploy.

### 2. Import the repo

In Vercel: **Add New… → Project → import the GitHub repo**. Leave the
framework preset (Next.js), build command (`pnpm build`), and output
directory at their auto-detected defaults.

### 3. Set environment variables

The running app reads exactly **two** variables (both are baked into the
client bundle at build time _and_ read on the server at runtime, so set them
**before the first deploy** and redeploy after any change):

| Variable                        | Value (fill in your own)                                                                           |
| ------------------------------- | -------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | `https://<your-ref>.supabase.co`                                                                   |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your **publishable** key (`sb_publishable_…`, or legacy anon `eyJ…`) — never the `sb_secret_…` key |

Add them for the Production (and Preview, if you use it) environments.

You do **not** need `DATABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` on Vercel —
the app never reads them. `DATABASE_URL` is only for the one-time
migrate/seed in step 1, run from your machine (use the **Session pooler**
connection string there; the direct `db.<ref>.supabase.co` host is
IPv6-only). Leave both out of Vercel unless a later phase needs them.

### 4. Deploy, then wire up auth redirects

Deploy. Once you have the Vercel URL, open Supabase → **Authentication → URL
Configuration** and set **Site URL** to your Vercel domain (and add it under
**Redirect URLs**) so the sign-in email links resolve to the deployed app
instead of `localhost`.

### 5. Make yourself admin

Sign in at `https://<your-app>.vercel.app/login`, then promote your account
(Supabase dashboard SQL editor, or `psql "$DATABASE_URL" -c "update profiles
set role = 'admin';"` from your machine). The **Admin** link appears in the
header, and `/admin/queue` has the three seeded proposals to review.

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
