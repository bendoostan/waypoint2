-- 0005_multi_leg: multi-leg (round-trip / open-jaw) award trips + design fields.
-- Additive only — migrations 0001-0004 are frozen (no drops/renames/type
-- changes). The plans table is still empty (Phase 3 has not started), so the
-- reshaped engine output (plans.strategies jsonb) invalidates nothing here.

-- A round_trip route is priced PER DIRECTION in points_oneway (the same
-- convention the ANA seed row already uses) but MUST be booked as a round trip
-- on ONE program — it cannot be mixed with a different return program. This
-- column replaces the prose constraint the ANA seed row carried in its notes.
alter table public.award_routes
  add column booking_unit text not null default 'one_way'
    check (booking_unit in ('one_way', 'round_trip'));

-- Design-system fields for the Phase 3 consumer app. The engine ignores them;
-- both are nullable and the UI must never break when they are null.
alter table public.card_catalog add column brand_color text;
alter table public.card_catalog add column logo_url text;

-- A goal's itinerary as an ordered list of legs (leg 1 = outbound, leg 2 =
-- return). A real award trip flies out on one program and home on another from
-- a single shared wallet, so each leg carries its own origin/destination/cabin
-- and is matched independently. Scope is one or two legs; the engine rejects
-- 3+ at its input boundary. goals keeps its existing origin/destination/cabin
-- columns untouched — a goal with no goal_legs rows is treated as a single leg
-- synthesized from those columns. No backfill: no real goal data exists yet.
create table public.goal_legs (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals (id) on delete cascade,
  leg_index integer not null check (leg_index in (1, 2)),
  origin_airport text not null check (origin_airport ~ '^[A-Z]{3}$'),
  destination_airport text check (destination_airport ~ '^[A-Z]{3}$'),
  destination_region text,
  cabin text not null check (
    cabin in ('economy', 'premium_economy', 'business', 'first')
  ),
  -- airport preferred; region is the fallback — at least one must be set
  check (destination_airport is not null or destination_region is not null),
  unique (goal_id, leg_index)
);

create index goal_legs_goal_id_idx on public.goal_legs (goal_id);

-- RLS: owner-only, mirroring goals. A goal_legs row is visible/writable iff
-- its parent goal belongs to auth.uid().
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
