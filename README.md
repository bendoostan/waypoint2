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

## Scripts

| Script                                         | Purpose                                     |
| ---------------------------------------------- | ------------------------------------------- |
| `pnpm dev` / `pnpm build` / `pnpm start`       | Next.js                                     |
| `pnpm seed`                                    | Seed the local DB (safe to rerun)           |
| `pnpm db:types`                                | Regenerate DB types from the local schema   |
| `pnpm test`                                    | Run tests once (`pnpm test:watch` to watch) |
| `pnpm lint` / `pnpm typecheck` / `pnpm format` | Hygiene                                     |

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
