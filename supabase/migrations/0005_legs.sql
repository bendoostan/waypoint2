-- 0005_legs: first-class trip legs (round-trip / open-jaw), per-route booking
-- unit and pricing mode, and design brand fields.
--
-- Additive only — migrations 0001-0004 are frozen and applied to the hosted
-- project (no drops, no renames, no type changes to existing columns). The
-- plans table is still empty (the consumer app is Phase 3), so the reshaped
-- engine output in plans.strategies invalidates nothing here.

-- --------------------------------------------------------------------------
-- award_routes.booking_unit
-- --------------------------------------------------------------------------
-- points_oneway stays the price of a SINGLE directional leg in both cases.
-- 'round_trip' means the route can only be used when it supplies BOTH legs of
-- a two-leg trip: it may not be paired with a different return route, and it
-- may not serve a one-way goal. This column replaces the prose that the ANA
-- seed row used to carry in its notes.
alter table public.award_routes
  add column booking_unit text not null default 'one_way'
    check (booking_unit in ('one_way', 'round_trip'));

comment on column public.award_routes.booking_unit is
  'one_way: an independent directional leg. round_trip: supplies BOTH legs of '
  'a two-leg trip on one program — never paired with a different return, never '
  'used for a one-way goal. points_oneway is per direction in both cases.';

comment on column public.award_routes.points_oneway is
  'Price of a single directional leg. A round_trip route costs points_oneway '
  'per direction (points_oneway * 2 for the whole round trip).';

-- --------------------------------------------------------------------------
-- award_routes.pricing_mode
-- --------------------------------------------------------------------------
-- Per route, NOT per program: Aeroplan prices partner awards from a fixed
-- distance chart but Air Canada metal dynamically, so one program legitimately
-- holds both. V1 ships fixed charts only; this column is recorded but not yet
-- acted on (no engine branching, no UI treatment) so the research pipeline has
-- somewhere to put the distinction. Dynamic banding is Phase 7.
alter table public.award_routes
  add column pricing_mode text not null default 'fixed'
    check (pricing_mode in ('fixed', 'dynamic'));

comment on column public.award_routes.pricing_mode is
  'fixed: chart-priced, points_oneway is exact. dynamic: revenue-linked '
  '(Phase 7). Property of the route, not the program. Recorded but not yet '
  'acted on — V1 ships fixed only.';

-- Backfill the one seeded round-trip-only sweet spot. On the hosted project the
-- ANA route was seeded before booking_unit existed, so it defaulted to
-- 'one_way'; flip it and normalise its notes to drop the round-trip-only prose
-- that booking_unit now encodes. On a fresh reset award_routes is empty when
-- this runs (the seed writes the correct value), so this is a no-op there.
update public.award_routes
set booking_unit = 'round_trip',
    notes = 'seed; points_oneway is half the round-trip price'
where booking_url like 'https://www.ana.co.jp/%'
  and cabin = 'business';

-- --------------------------------------------------------------------------
-- Brand fields for the Phase 3 design (currencies AND card_catalog)
-- --------------------------------------------------------------------------
-- Both nullable; nothing populates them yet (research jobs will). The engine
-- ignores them and the UI must never break when they are null.
alter table public.currencies
  add column brand_color text
    check (brand_color is null or brand_color ~ '^#[0-9A-Fa-f]{6}$'),
  add column logo_url text;

alter table public.card_catalog
  add column brand_color text
    check (brand_color is null or brand_color ~ '^#[0-9A-Fa-f]{6}$'),
  add column logo_url text;

-- --------------------------------------------------------------------------
-- goal_legs: a goal's itinerary as an ordered list of legs
-- --------------------------------------------------------------------------
-- Origin and destination both live on the leg — that is what makes an open-jaw
-- (into Tokyo, home from Osaka) expressible. Cabin and month live there too:
-- people fly business out and economy back, and an open-jaw can straddle a
-- month boundary. Scope is one or two legs; three or more is out of scope and
-- the engine rejects it at its input boundary.
create table public.goal_legs (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals (id) on delete cascade,
  seq integer not null check (seq in (1, 2)),
  origin_airport text not null check (origin_airport ~ '^[A-Z]{3}$'),
  destination_airport text check (destination_airport ~ '^[A-Z]{3}$'),
  destination_region text,
  cabin text not null check (
    cabin in ('economy', 'premium_economy', 'business', 'first')
  ),
  travel_month text check (travel_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  -- airport preferred; region is the fallback — at least one must be set
  check (destination_airport is not null or destination_region is not null),
  unique (goal_id, seq)
);

create index goal_legs_goal_id_idx on public.goal_legs (goal_id);

-- Backfill every existing goal into one or two legs. Existing goals carry no
-- trip-type information, so treat them as round trips: leg 1 is the goal's own
-- origin -> destination, leg 2 is the reverse. A region-only destination has no
-- airport to reverse from (leg 2's origin must be a real airport), so such a
-- goal backfills to a single leg — hence "one or two".
insert into public.goal_legs
  (goal_id, seq, origin_airport, destination_airport, destination_region,
   cabin, travel_month)
select id, 1, origin_airport, destination_airport, destination_region,
       cabin, travel_month
from public.goals;

insert into public.goal_legs
  (goal_id, seq, origin_airport, destination_airport, destination_region,
   cabin, travel_month)
select id, 2, destination_airport, origin_airport, null,
       cabin, travel_month
from public.goals
where destination_airport is not null;

-- The goals origin/destination/cabin/month columns are deprecated in favour of
-- goal_legs. They are left in place and untouched (0001-0004 are frozen); new
-- code reads goal_legs and nothing writes these columns.
comment on column public.goals.origin_airport is
  'Deprecated (0005): read goal_legs instead. Left in place, never written.';
comment on column public.goals.destination_airport is
  'Deprecated (0005): read goal_legs instead. Left in place, never written.';
comment on column public.goals.destination_region is
  'Deprecated (0005): read goal_legs instead. Left in place, never written.';
comment on column public.goals.cabin is
  'Deprecated (0005): read goal_legs instead. Left in place, never written.';
comment on column public.goals.travel_month is
  'Deprecated (0005): read goal_legs instead. Left in place, never written.';

-- --------------------------------------------------------------------------
-- RLS + grants for goal_legs — owner-only, mirroring goals exactly
-- --------------------------------------------------------------------------
-- A goal_legs row is visible/writable iff its parent goal belongs to
-- auth.uid(). New tables are not auto-exposed to the Data API roles, so the
-- grants are explicit (see 0001 for the pattern).
alter table public.goal_legs enable row level security;

create policy "own goal legs" on public.goal_legs
  for all to authenticated
  using (
    exists (
      select 1 from public.goals g
      where g.id = goal_legs.goal_id and g.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.goals g
      where g.id = goal_legs.goal_id and g.user_id = (select auth.uid())
    )
  );

grant select, insert, update, delete on public.goal_legs to authenticated;
grant select, insert, update, delete on public.goal_legs to service_role;
