# Waypoint v2 — Build Plan

_Working doc. Lives at repo root as `PLAN.md`. Every Claude Code prompt in this project references this file._

---

## 1. What Waypoint actually is

One sentence: **a deterministic points-optimization engine between two data surfaces.**

```
┌─────────────────────────┐
│  ADMIN + PIPELINE       │  feeds the knowledge graph
│  (you + AI research     │  cards, currencies, transfer edges,
│   jobs + Seats.aero)    │  bonuses, award prices
└───────────┬─────────────┘
            ▼
┌─────────────────────────┐
│  THE ENGINE             │  pure TypeScript, unit-tested, no AI
│  wallet + goal → paths, │  graph solve: cheapest reachable
│  gap, months-to-earn    │  redemption + earn timeline
└───────────┬─────────────┘
            ▼
┌─────────────────────────┐
│  CONSUMER APP           │  goal in → ranked flights out,
│  (+ SEO/affiliate pages)│  timeline visual, apply-for-card CTA
└─────────────────────────┘
```

Everything from the brain-dump maps onto this:

| Brain-dump item                                | Where it lives                                                                     |
| ---------------------------------------------- | ---------------------------------------------------------------------------------- |
| Cards by issuer, currencies, point values      | Graph **nodes** (`card_catalog`, `currencies`)                                     |
| Transfer partners, multi-transfer optimization | Graph **edges** (`transfer_partners`) + engine pathfinding                         |
| Temporary bonuses                              | **Edge modifiers** with time windows (`transfer_bonuses`)                          |
| Freedom→Sapphire extra value                   | **Unlock mechanic** on currencies (see §3)                                         |
| Points per spend category                      | `earning_rates` + user's `monthly_spend` → earn velocity                           |
| Flights: origin + destination, which to show   | `award_routes` ranked by **reachability score** (§5)                               |
| Time-to-earn visual                            | Engine output: `timeline` (§4)                                                     |
| AI autopopulation                              | Ingestion pipeline → **review queue** (§6)                                         |
| Zero maintenance                               | Low-touch: AI drafts, you approve. Availability is the only true zero-touch layer. |

## 2. Principles (named, non-negotiable)

1. **Deterministic core, AI at the edges.** The engine is pure TS with unit tests. AI is allowed to (a) research data into a staging queue and (b) phrase rationale text. AI is never allowed to compute a ratio, a gap, or a recommendation.
2. **Every recommendation is traceable.** Any number shown to a user must be reproducible from rows in the DB. No black boxes — this is what makes the affiliate CTA trustworthy.
3. **Draft → review → publish.** All AI-ingested data lands in `staging_changes` with a diff. Nothing user-facing changes without approval. Target: ≤5 min/week of review.
4. **Fresh repo, inherited soul.** New Next.js codebase, fresh migrations. Keep: the schema _concepts_, the serif/editorial design language, the goal-backward UX (Target → Card to open → Earn → Burn).
5. **Small graph, exact answers.** ~6 bank currencies × ~40 airline programs × ~150 edges. This is small enough to solve exactly (depth-2 search), so never approximate.

## 3. Data model v2

Fresh Supabase project, migrations authored from zero. Superset of the prototype's schema.

### Reference layer (admin-managed, AI-drafted)

```sql
-- Bank currencies AND airline/hotel programs live in one table
currencies (
  id uuid pk,
  name text,                       -- "Chase Ultimate Rewards", "ANA Mileage Club"
  kind text,                       -- 'bank' | 'airline' | 'hotel' | 'cashback'
  alliance text null,              -- 'star' | 'oneworld' | 'skyteam' | null
  cashback_cpp numeric,            -- value if NOT unlocked (UR basic = 1.0)
  transfer_cpp numeric,            -- typical value when transferable (UR = ~2.0)
  requires_unlock boolean,         -- true for UR/MR-style tiered currencies
  is_active boolean
)

card_catalog (
  id uuid pk,
  name text, issuer text,          -- issuer as text + index; table if admin filters demand it
  currency_id uuid fk,
  annual_fee int,
  unlocks_transfers boolean,       -- THE Freedom→Sapphire mechanic (see below)
  affiliate_url text null,
  application_rules jsonb null,    -- 5/24 etc., phase 2+
  is_active boolean, discontinued_at timestamptz null
)

earning_rates (
  id uuid pk, card_id fk,
  category text,                   -- enum: dining, travel, groceries, gas, transit,
                                   -- streaming, drugstore, online_retail, everything_else
  rate numeric,                    -- 3.0 = 3x
  cap_monthly_usd int null,
  notes text null
)

welcome_offers (
  id uuid pk, card_id fk,
  points int, min_spend_usd int, window_months int,
  ends_at timestamptz null, source_url text,
  is_active boolean
)

transfer_partners (
  id uuid pk,
  from_currency_id fk, to_currency_id fk,
  ratio_num int, ratio_den int,    -- 1:1 = (1,1); Marriott→air 3:1 = (3,1)
  transfer_hours_est int,          -- instant=0, ANA=~48
  min_transfer int null, increment int null,
  is_active boolean
)

transfer_bonuses (
  id uuid pk, transfer_partner_id fk,
  bonus_pct int,                   -- 30 = 30% bonus
  starts_at timestamptz, ends_at timestamptz,
  source_url text,
  status text                      -- 'draft' | 'approved' | 'expired'
)

award_routes (                     -- the sweet-spot moat, evolved
  id uuid pk,
  name text,                       -- "ANA round-trip business to Japan"
  program_currency_id fk,
  origin_region text, origin_airports text[] null,   -- ["JFK","EWR"] when specific
  destination_region text, destination_airports text[] null,
  cabin text, points_oneway int, taxes_fees_usd_est int,
  booking_url text, notes text,
  is_active boolean, last_verified_at timestamptz
)

airports (iata pk, name, city, region, lat, lng)   -- static load, OurAirports dataset
```

**The unlock mechanic (Freedom→Sapphire, solved):** Freedom URs aren't a different currency and there's no "transfer" — holding a CSP/CSR flips the _whole UR balance_ from `cashback_cpp` to transferable. So: a user's currency is **unlocked** iff they hold ≥1 card where `unlocks_transfers = true` for that currency. The engine then values the balance at `transfer_cpp` and opens its transfer edges. This also produces the killer recommendation for free: _"Your 80k Freedom points are worth ~$800 today. Open a Sapphire Preferred and they become ~$1,640 toward this flight"_ — an affiliate CTA generated by the data model itself.

### User layer

```sql
profiles (id pk = auth.uid, home_airport char(3) null,
          monthly_spend jsonb)     -- {"dining": 600, "groceries": 800, ...}
user_cards (id, user_id, card_id fk, points_balance int, opened_at date null)
goals (id, user_id, title,
       origin_airport char(3), destination_airport char(3) null,
       destination_region text,    -- airport preferred; region = fallback
       cabin text, travel_month text null, num_travelers int,
       flexibility text)           -- 'exact' | 'flexible_month' | 'anytime'
plans (id, goal_id unique, user_id,
       strategies jsonb,           -- ranked candidate array, engine output (§4)
       generated_at timestamptz)
```

### Pipeline layer

```sql
staging_changes (
  id uuid pk,
  target_table text, target_id uuid null,   -- null = proposed insert
  proposed jsonb, diff jsonb,
  source text,                     -- 'claude_research' | 'gemini' | 'seats_aero' | 'manual'
  confidence numeric, source_urls text[],
  status text,                     -- 'pending' | 'approved' | 'rejected' | 'auto_applied'
  created_at, reviewed_at, reviewed_by
)

ingest_runs (id, job_name, started_at, finished_at, status, stats jsonb, error text null)

availability_cache (               -- the ONLY true zero-touch table
  id, award_route_id fk, date date, cabin text,
  seats_available int, source text default 'seats_aero', fetched_at
)
```

RLS: user tables scoped to `auth.uid()`. Reference + pipeline tables: read for authed users where relevant, write only for `role = 'admin'` (your uid seeded as admin).

## 4. The engine (pure TS, `/lib/engine`)

Input: `wallet` (user_cards + balances), `goal`, plus reference data. Output: `strategies` JSON. No I/O inside the engine — fetch outside, pass in, so it's trivially unit-testable.

1. **Effective wallet.** Group balances by currency → apply unlock rule → each currency gets `{balance, unlocked, cpp}`.
2. **Reachability expansion.** From each unlocked currency, walk `transfer_partners` (depth ≤ 2 — bank→airline covers ~all of reality; depth 2 catches Marriott-style hops). Apply any `approved` + in-window `transfer_bonuses` to edge ratios. Result: max points deliverable into every program.
3. **Candidate routes.** `award_routes` matching goal O/D/cabin (airport match beats region match), filtered/annotated by `availability_cache`.
4. **Per-candidate solve.** Needed = `points_oneway × legs × travelers`. Choose cheapest source combination by opportunity cost (value sacrificed = points × cpp of source). ≤10 currencies → exact search, no heuristics.
5. **Gap closure.** If short: (a) best `welcome_offers` ranked by `points ÷ effective cost` → the affiliate recommendation; (b) earn velocity = Σ over categories of `monthly_spend[cat] × best held/recommended card rate` → `months_to_goal = gap ÷ velocity`.
6. **Score & rank.** `reachability`: reachable now → reachable in ≤ N months → needs new card → stretch. Tie-break on total value efficiency and transfer friction (fewer hops, faster partners).
7. **Timeline.** Emit `{month, projected_balance, events: [bonus posts, transfer, book]}` — this is the time-to-earn visual, precomputed.

Rationale text: template strings in v1 (fast, honest, testable). Optional Claude polish in v2 — phrasing only, numbers interpolated from engine output.

## 5. Flights: how many, how loaded, which shown

- **How loaded:** never a bulk flight DB. Routes come from `award_routes` (curated + AI-drafted candidates you approve). Live seats come from Seats.aero _per goal, on demand_, into `availability_cache` (respecting their cache guidance).
- **How many:** engine returns all candidates; UI shows top **3** ranked by reachability, expandable. Three is a recommendation; thirty is a search engine — you're not building a search engine.
- **Which:** the reachability score (§4.6) — which is exactly "based on the cards they have," plus what one new card would unlock. Tiers surface naturally as UI badges: _Bookable now_ / _Reachable by March_ / _Unlock with one card_.

## 6. Data source per field

| Data                                   | Source                                                                                                        | Cadence               | Publish path                                            |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------- |
| Airports                               | OurAirports static dataset                                                                                    | once                  | direct seed                                             |
| Card catalog (names, fees, currencies) | Claude/Gemini research job w/ web search (RewardsCC API as candidate structured source — evaluate in Phase 4) | monthly diff-check    | review queue                                            |
| Earning rates per category             | same research job                                                                                             | monthly               | review queue                                            |
| Welcome offers                         | AI research weekly; affiliate network feeds (CJ/Impact) once approved — they carry offer terms                | weekly                | review queue                                            |
| Transfer partners + ratios             | hand-verified once (~150 rows, one afternoon, this is the moat — do not delegate v1)                          | AI diff-check monthly | review queue                                            |
| Transfer bonuses (temporary)           | AI research job scanning announcements                                                                        | 2×/week               | review queue; **auto-expire** by `ends_at` (zero-touch) |
| Point valuations (cpp)                 | AI pulls published valuations (TPG/FM-style), quarterly                                                       | quarterly             | review queue                                            |
| Award routes / sweet spots             | you + AI-drafted candidates                                                                                   | ad hoc                | review queue                                            |
| Live availability                      | **Seats.aero API**                                                                                            | on demand + cron warm | auto (cache table)                                      |

**On "zero maintenance," candidly:** the steady state is ~5 min/week approving diffs from your phone, plus a quarterly valuation pass. Fully autonomous publishing of AI-researched financial data is a trust time-bomb — one wrong ratio and a user strands points. The review queue _is_ the product's integrity.

## 7. Phases, tools, prompts

| #   | Phase                                                                                                        | Tool                                         | Output                   |
| --- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------- | ------------------------ |
| 0   | Foundation: repo, Supabase, migrations, seed, CI, `CLAUDE.md`                                                | Claude Code                                  | running skeleton         |
| 1   | Reference schema + **engine v1** with full test suite                                                        | Claude Code                                  | tested core              |
| 2   | Admin portal: CRUD by issuer/currency/partner, bonus manager, review queue                                   | Claude Code (+ Claude Design pass on tokens) | you can manage the graph |
| 3   | Consumer app: wallet, goal flow (O+D airports), plan page, timeline visual                                   | Claude Design → Claude Code                  | user-facing v2           |
| 4   | Pipeline: Trigger.dev research jobs → staging; Seats.aero integration                                        | Claude Code                                  | low-touch data           |
| 5   | Hardening + growth: RLS audit, evals on ingestion accuracy, SEO pages (cards, sweet spots), affiliate wiring | Claude Code                                  | launchable               |

Sequence rationale: engine before admin (admin edits what the engine reads — schema must be settled); admin before pipeline (the queue needs a UI before jobs fill it); consumer app mid-way so you can feel the product early.

**Lovable: skip it.** Its niche (fast UI on Supabase) is fully covered by Claude Design → Claude Code against your own repo, without the export/import friction you just went through. Reconsider only if you want disposable marketing pages.

**Prompt protocol:** one prompt per phase, generated _after_ the previous phase ships, informed by what actually got built. Prompts written blind for Phase 3 against an imaginary Phase 1 are worse prompts. Each prompt tells Claude Code to read this file first.

---

## Prompt 1 — Phase 0, for Claude Code

> **Project: Waypoint v2 — Phase 0, Foundation**
>
> Read `PLAN.md` at the repo root in full before writing any code. It is the source of truth for architecture, schema, and principles. Flag conflicts between it and this prompt — don't silently pick one.
>
> **Context:** Waypoint is a goal-backward points/miles travel planner: a deterministic optimization engine over a knowledge graph of credit cards, currencies, transfer partners, and award routes, with credit-card-affiliate monetization. This phase produces a clean foundation only — no features.
>
> **Stack (fixed):** Next.js 15 (App Router, TS strict), Supabase (Postgres + Auth, CLI-managed migrations), Tailwind + shadcn/ui, Vitest, pnpm, Vercel-deployable. Trigger.dev and Vercel AI SDK arrive in Phase 4 — do not scaffold them now.
>
> **Tasks:**
>
> 1. Scaffold the app: `create-next-app` (TS, App Router, Tailwind, `src/`), shadcn/ui init, ESLint + Prettier, strict tsconfig.
> 2. Supabase: init CLI project, local dev via `supabase start`, wire `.env.local` / `.env.example` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, server-side service key kept server-only). Typed client helpers for server components, client components, and route handlers.
> 3. Migration `0001_reference`: `currencies`, `card_catalog`, `earning_rates`, `welcome_offers`, `transfer_partners`, `transfer_bonuses`, `award_routes`, `airports` — exactly per PLAN.md §3, with FKs, sensible indexes (issuer, currency_id, is_active, bonus window), and check constraints on enums.
> 4. Migration `0002_users`: `profiles`, `user_cards`, `goals`, `plans` per §3, with RLS: owner-only on user tables; reference tables readable by authenticated users; writes to reference tables restricted to admin (profiles.role = 'admin', default 'user').
> 5. Migration `0003_pipeline`: `staging_changes`, `ingest_runs`, `availability_cache` per §3. Admin-only.
> 6. `supabase gen types typescript` wired to `src/types/database.ts` with a pnpm script.
> 7. Seed script (`pnpm seed`, idempotent): load `airports` from the OurAirports public dataset (IATA-coded, scheduled-service airports only); seed 4 currencies (Chase UR with `requires_unlock=true`, Amex MR, Capital One, United MileagePlus), 5 cards (Sapphire Preferred `unlocks_transfers=true`, Freedom Unlimited `unlocks_transfers=false`, Amex Gold, Venture X, United Explorer) with realistic earning rates and one welcome offer each, ~10 transfer edges, one active transfer bonus, 3 award routes (US→Japan business, US→Europe economy, US→Hawaii economy). Realistic placeholder values are fine — mark every seeded row's provenance in a `notes`/source field as `seed`.
> 8. Auth: Supabase email OTP, minimal `/login`, authenticated layout group, `profiles` row auto-created on first sign-in (trigger or callback). No styling effort beyond default shadcn.
> 9. Vitest configured; one real test proving the seed data satisfies referential integrity (e.g. every `transfer_bonus` maps to an active partner edge).
> 10. Write `CLAUDE.md`: stack conventions, migration workflow (`supabase migration new` → `db reset` → typegen), seed command, the five principles from PLAN.md §2 verbatim, and the rule "engine code takes data as arguments, never fetches."
> 11. `README.md`: local setup in ≤10 steps, verified by following them yourself via `supabase db reset && pnpm seed && pnpm dev && pnpm test`.
>
> **Definition of done:** fresh clone → running app with login + seeded DB in ≤10 minutes; all migrations apply cleanly from zero; types generated; test green. Deliver as small, reviewable commits with imperative messages.
>
> **Do NOT:** build the engine, admin UI, or consumer screens; install Trigger.dev/AI SDK/Stripe; hand-write DB types; put secrets in client code.

---

## Prompt index / status

Phase numbering has grown more granular than the table in §7 as work actually
shipped (an engine amendment inserted as 1.5, Phase 3 split into a design
pass and three consumer-UI sub-phases, the pipeline phase split so Seats.aero
tracks separately from the AI research jobs). Status below reflects that
real numbering.

- ✅ **Phase 0** — foundation (repo, Supabase, migrations, seed, CI, `CLAUDE.md`)
- ✅ **Phase 1** — engine v1 + test suite
- ✅ **Phase 1.5** — engine amendment: multi-leg (open-jaw) trips as first-class
  (`goal_legs`, `migration 0005_legs`), `cabin_alternative` and `pricing_mode`
  in `schema.ts`
- ✅ **Phase 2** — admin portal + review queue
- ✅ **Phase 3a** — Claude Design brief for the consumer app, approved
  (tokens/fonts/`design/DESIGN.md`)
- ✅ **Phase 3b-i** — wallet, goal creation (open-jaw-aware wizard), admin
  transfer graph
- ⬜ **Phase 3b-ii / 3b-iii** — remaining consumer screens (plan page,
  timeline visual)
- ⏸ **Phase 4** — Trigger.dev AI research jobs → staging. Deliberately
  deferred past initial launch: admin's manual CRUD plus hand-curated routes
  cover v1 content.
- ⬜ **Phase 5** — hardening, evals, SEO/affiliate
- ⏸ **Phase 7** — Seats.aero live-availability integration. Deliberately
  deferred past initial launch for the same reason as Phase 4.

_Open items parked deliberately: application rules (5/24) → Phase 2+; hotel awards → post-launch; own cpp valuations from award data → post-launch; affiliate network application → start paperwork during Phase 2, it's slow._
