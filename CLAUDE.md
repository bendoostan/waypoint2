# Waypoint v2

Read `PLAN.md` before anything else — it is the source of truth for
architecture, schema, and principles. This file covers day-to-day mechanics.

## Stack

- Next.js 15, App Router, TypeScript strict, `src/` layout, `@/*` alias
- Supabase: Postgres + Auth (email OTP), CLI-managed migrations
- Tailwind v4 + shadcn/ui (new-york, neutral). Components are vendored under
  `src/components/ui/` — the shadcn registry is unreachable from some
  sandboxes, so add new components by vendoring their source too.
- Vitest for tests, pnpm for packages, Prettier + ESLint (flat config)
- Deployable to Vercel; Trigger.dev and Vercel AI SDK arrive in Phase 4,
  do not add them earlier

## Principles (PLAN.md §2, verbatim)

1. **Deterministic core, AI at the edges.** The engine is pure TS with unit
   tests. AI is allowed to (a) research data into a staging queue and (b)
   phrase rationale text. AI is never allowed to compute a ratio, a gap, or a
   recommendation.
2. **Every recommendation is traceable.** Any number shown to a user must be
   reproducible from rows in the DB. No black boxes — this is what makes the
   affiliate CTA trustworthy.
3. **Draft → review → publish.** All AI-ingested data lands in
   `staging_changes` with a diff. Nothing user-facing changes without
   approval. Target: ≤5 min/week of review.
4. **Fresh repo, inherited soul.** New Next.js codebase, fresh migrations.
   Keep: the schema _concepts_, the serif/editorial design language, the
   goal-backward UX (Target → Card to open → Earn → Burn).
5. **Small graph, exact answers.** ~6 bank currencies × ~40 airline programs
   × ~150 edges. This is small enough to solve exactly (depth-2 search), so
   never approximate.

**Engine rule: engine code takes data as arguments, never fetches.** Fetch
outside, pass in. This is what keeps `/lib/engine` trivially unit-testable.

## Commands

| Command                                        | What it does                                     |
| ---------------------------------------------- | ------------------------------------------------ |
| `pnpm dev`                                     | Next.js dev server                               |
| `pnpm seed`                                    | Idempotent DB seed (airports + reference graph)  |
| `pnpm db:types`                                | Regenerate `src/types/database.ts` from local DB |
| `pnpm test`                                    | Vitest, single run                               |
| `pnpm lint` / `pnpm typecheck` / `pnpm format` | The usual                                        |

## Migration workflow

1. `supabase migration new <name>` → edit the generated SQL file
2. `supabase db reset` → replays all migrations from zero (requires Docker)
3. `pnpm db:types` → regenerate `src/types/database.ts` (commit it)

Never edit an applied migration; add a new one. Never hand-edit
`src/types/database.ts`. `pnpm db:types` calls @supabase/postgres-meta
directly (same generator as `supabase gen types`) so it also works without
Docker against any `DATABASE_URL`.

Docker-less environments (CI, sandboxes): `scripts/ci/supabase-shim.sql`
fakes the `auth` schema and API roles on plain Postgres so migrations can be
applied and verified. Apply shim, then migrations in filename order. Never
run the shim against a real Supabase database.

## Engine (`src/lib/engine/`)

Pure TypeScript, zero I/O, fully unit-tested. No `@supabase/*` imports
except `import type { Database }`; no `Date.now()`/`new Date()` — every
time-dependent function takes `now: Date`.

| Module                | Role (PLAN.md §4 stage)                                                 |
| --------------------- | ----------------------------------------------------------------------- |
| `types.ts`            | input types derived from DB rows; `EngineInput` bundle                  |
| `schema.ts`           | zod contract for `PlanResult` — the `plans.strategies` jsonb shape      |
| `effective-wallet.ts` | §4.1 unlock rule, cpp pricing, unlock opportunities                     |
| `reachability.ts`     | §4.2 depth-≤2 expansion, bonus windows, min/increment rounding          |
| `routes.ts`           | §4.3 candidate matching (airport beats region), availability annotation |
| `solve.ts`            | §4.4 exact subset-search solver by opportunity cost                     |
| `gap.ts`              | §4.5 offer ranking + earn velocity + months-to-goal variants            |
| `rank.ts`             | §4.6 tier assignment and deterministic sort                             |
| `timeline.ts`         | §4.7 per-strategy monthly projection (≤24 entries)                      |
| `rationale.ts`        | template-string rationale — no AI near the numbers                      |
| `index.ts`            | `generatePlan(input)`: composes everything, zod-parses output           |
| `from-db.ts`          | DB rows → `EngineInput` mapping (types only, no fetching)               |

**`legs` caveat:** goals have no one-way/round-trip column yet. The engine
takes `legs: 1 | 2` as an explicit input and callers default to 2 (round
trip). Adding a goal column for it is a Phase 3 decision — do not migrate
for it earlier.

## Admin portal (`src/app/(app)/admin/`)

- The `(app)/admin` layout hard-gates with `notFound()` for non-admins; RLS
  (`is_admin()`) is the real control, the gate just hides URLs.
- All admin reads/writes go through the authenticated (RLS-gated) client —
  never the service-role key. Mutations are server actions that zod-validate
  (`src/lib/validation`) before writing.
- Applying a `staging_changes` row goes through the `apply_staging_change`
  /`reject_staging_change` RPCs (migration 0004): `security definer`,
  self-check `is_admin()`, and match `target_table` against a hard-coded
  whitelist via literal per-table branches — a table name is never
  interpolated into SQL. The review queue re-validates with the same zod
  schemas before calling apply; the DB function is the last line of defense.
- `scripts/ci/admin-smoke.sql` exercises apply end-to-end (CI `database` job).

## Conventions

- RLS on every table, no exceptions. User tables owner-only via
  `auth.uid()`; reference tables authenticated-read + admin-write via
  `public.is_admin()`; pipeline tables admin-only.
- New tables are not auto-exposed to the Data API: every migration must
  GRANT explicitly (see 0001 for the pattern).
- Seeded/AI-drafted rows carry provenance in `notes`/`source`/`source_url`.
- Secrets: only `NEXT_PUBLIC_*` vars are client-safe. The service-role key
  never appears in client code or NEXT_PUBLIC vars.
- Auth flows through `src/lib/supabase/{client,server,middleware}.ts` — do
  not instantiate Supabase clients ad hoc.
