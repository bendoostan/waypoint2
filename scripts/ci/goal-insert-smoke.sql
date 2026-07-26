-- Goal-creation smoke test for CI. Runs AFTER the shim, migrations, and seed.
-- Proves migration 0005's constraint relaxation: a goal writes only trip-level
-- fields (title / num_travelers / flexibility) while goal_legs carries the
-- itinerary. Any failed assertion aborts the transaction (and the CI step).
--
-- Wrapped in begin/rollback so it leaves no trace and stays idempotent.

\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email)
values ('bbbbbbbb-cccc-4ddd-8eee-000000000001', 'ci-goal@waypoint.test')
on conflict (id) do nothing;

-- Insert a goal with ONLY the three trip-level columns — no origin_airport,
-- destination_*, cabin, or travel_month. Under migration 0002 this would fail
-- the NOT NULLs and the destination check; 0005 relaxes them.
with g as (
  insert into public.goals (user_id, title, num_travelers, flexibility)
  values ('bbbbbbbb-cccc-4ddd-8eee-000000000001', 'Smoke: Tokyo', 2, 'flexible_month')
  returning id
)
insert into public.goal_legs
  (goal_id, seq, origin_airport, destination_airport, destination_region,
   cabin, travel_month)
select id, 1, 'SFO', 'HND', null, 'business', '2026-11' from g
union all
select id, 2, 'HND', 'SFO', null, 'business', '2026-11' from g;

do $$
declare n int;
begin
  -- The goal exists with its deprecated columns null.
  select count(*) into n from public.goals
    where title = 'Smoke: Tokyo'
      and origin_airport is null and cabin is null
      and destination_airport is null and destination_region is null
      and travel_month is null;
  if n <> 1 then
    raise exception 'expected 1 goal with null deprecated columns, got %', n;
  end if;

  -- ...and exactly two legs carry the real itinerary.
  select count(*) into n from public.goal_legs l
    join public.goals g on g.id = l.goal_id
    where g.title = 'Smoke: Tokyo';
  if n <> 2 then
    raise exception 'expected 2 goal_legs, got %', n;
  end if;
end $$;

rollback;
