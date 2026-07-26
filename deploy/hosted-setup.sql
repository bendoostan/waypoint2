-- Waypoint — one-shot hosted-project schema setup for the Supabase SQL Editor.
--
-- GENERATED FILE — do not edit by hand. Regenerate with:
--   bash scripts/gen-hosted-setup.sh
-- It is a verbatim concatenation of supabase/migrations/*.sql, in order; CI
-- fails if this file drifts from the migrations.
--
-- Run this ONCE against a FRESH Supabase project (Dashboard -> SQL Editor ->
-- New query -> paste -> Run). It creates the full schema. Re-running it on a
-- populated project will error on the CREATE TABLE statements.
--
-- A real Supabase project already provides the auth schema, auth.uid(), and the
-- anon/authenticated/service_role roles these migrations rely on, so do NOT run
-- scripts/ci/supabase-shim.sql here (that is only for plain Postgres in CI).
--
-- This bundle is SCHEMA ONLY. It seeds no data:
--   * The reference graph (currencies, cards, routes, ...) and the ~4,000
--     airport rows both load via `pnpm seed` once you have Node + a
--     DATABASE_URL pointed at the project (see README).
--   * Until airports are loaded, airport pickers must degrade to accepting a
--     validated raw IATA code (^[A-Z]{3}$) rather than offering autocomplete.


-- ======================================================================
-- supabase/migrations/0001_reference.sql
-- ======================================================================

-- 0001_reference: the knowledge graph's reference layer (PLAN.md section 3).
-- RLS is enabled here with no policies (deny-all); policies arrive in
-- 0002_users once profiles.role exists to distinguish admins.

-- Bank currencies AND airline/hotel programs live in one table.
create table public.currencies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  kind text not null check (kind in ('bank', 'airline', 'hotel', 'cashback')),
  alliance text check (alliance in ('star', 'oneworld', 'skyteam')),
  cashback_cpp numeric not null default 0 check (cashback_cpp >= 0),
  transfer_cpp numeric not null default 0 check (transfer_cpp >= 0),
  requires_unlock boolean not null default false,
  is_active boolean not null default true,
  notes text
);

create index currencies_kind_idx on public.currencies (kind);
create index currencies_is_active_idx on public.currencies (is_active);

create table public.card_catalog (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  issuer text not null,
  currency_id uuid not null references public.currencies (id),
  annual_fee integer not null default 0 check (annual_fee >= 0),
  unlocks_transfers boolean not null default false,
  affiliate_url text,
  application_rules jsonb,
  is_active boolean not null default true,
  discontinued_at timestamptz,
  notes text,
  unique (issuer, name)
);

create index card_catalog_issuer_idx on public.card_catalog (issuer);
create index card_catalog_currency_id_idx on public.card_catalog (currency_id);
create index card_catalog_is_active_idx on public.card_catalog (is_active);

create table public.earning_rates (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.card_catalog (id) on delete cascade,
  category text not null check (
    category in (
      'dining', 'travel', 'groceries', 'gas', 'transit',
      'streaming', 'drugstore', 'online_retail', 'everything_else'
    )
  ),
  rate numeric not null check (rate > 0),
  cap_monthly_usd integer check (cap_monthly_usd > 0),
  notes text,
  unique (card_id, category)
);

create index earning_rates_card_id_idx on public.earning_rates (card_id);

create table public.welcome_offers (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.card_catalog (id) on delete cascade,
  points integer not null check (points > 0),
  min_spend_usd integer not null check (min_spend_usd >= 0),
  window_months integer not null check (window_months > 0),
  ends_at timestamptz,
  source_url text,
  is_active boolean not null default true
);

create index welcome_offers_card_id_idx on public.welcome_offers (card_id);
create index welcome_offers_is_active_idx on public.welcome_offers (is_active);

create table public.transfer_partners (
  id uuid primary key default gen_random_uuid(),
  from_currency_id uuid not null references public.currencies (id),
  to_currency_id uuid not null references public.currencies (id),
  ratio_num integer not null check (ratio_num > 0),
  ratio_den integer not null check (ratio_den > 0),
  transfer_hours_est integer not null default 0 check (transfer_hours_est >= 0),
  min_transfer integer check (min_transfer > 0),
  increment integer check (increment > 0),
  is_active boolean not null default true,
  notes text,
  unique (from_currency_id, to_currency_id),
  check (from_currency_id <> to_currency_id)
);

create index transfer_partners_from_currency_id_idx
  on public.transfer_partners (from_currency_id);
create index transfer_partners_to_currency_id_idx
  on public.transfer_partners (to_currency_id);
create index transfer_partners_is_active_idx
  on public.transfer_partners (is_active);

create table public.transfer_bonuses (
  id uuid primary key default gen_random_uuid(),
  transfer_partner_id uuid not null
    references public.transfer_partners (id) on delete cascade,
  bonus_pct integer not null check (bonus_pct > 0),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  source_url text,
  status text not null default 'draft'
    check (status in ('draft', 'approved', 'expired')),
  check (ends_at > starts_at)
);

create index transfer_bonuses_partner_window_idx
  on public.transfer_bonuses (transfer_partner_id, starts_at, ends_at);
create index transfer_bonuses_status_idx on public.transfer_bonuses (status);

-- The sweet-spot moat: curated award pricing, matched by airport when
-- origin/destination_airports is set, by region otherwise.
create table public.award_routes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  program_currency_id uuid not null references public.currencies (id),
  origin_region text not null,
  origin_airports text[],
  destination_region text not null,
  destination_airports text[],
  cabin text not null check (
    cabin in ('economy', 'premium_economy', 'business', 'first')
  ),
  points_oneway integer not null check (points_oneway > 0),
  taxes_fees_usd_est integer not null default 0 check (taxes_fees_usd_est >= 0),
  booking_url text,
  notes text,
  is_active boolean not null default true,
  last_verified_at timestamptz
);

create index award_routes_program_currency_id_idx
  on public.award_routes (program_currency_id);
create index award_routes_is_active_idx on public.award_routes (is_active);

-- Static load from the OurAirports dataset (IATA-coded, scheduled service).
create table public.airports (
  iata text primary key check (iata ~ '^[A-Z]{3}$'),
  name text not null,
  city text,
  region text,
  lat double precision,
  lng double precision,
  source text
);

-- Deny-all until 0002_users adds read/admin policies.
alter table public.currencies enable row level security;
alter table public.card_catalog enable row level security;
alter table public.earning_rates enable row level security;
alter table public.welcome_offers enable row level security;
alter table public.transfer_partners enable row level security;
alter table public.transfer_bonuses enable row level security;
alter table public.award_routes enable row level security;
alter table public.airports enable row level security;

-- New tables are no longer auto-exposed to the Data API roles, so grants are
-- explicit. Row access is still governed by RLS policies.
grant select on
  public.currencies,
  public.card_catalog,
  public.earning_rates,
  public.welcome_offers,
  public.transfer_partners,
  public.transfer_bonuses,
  public.award_routes,
  public.airports
to authenticated;

grant select, insert, update, delete on
  public.currencies,
  public.card_catalog,
  public.earning_rates,
  public.welcome_offers,
  public.transfer_partners,
  public.transfer_bonuses,
  public.award_routes,
  public.airports
to service_role;


-- ======================================================================
-- supabase/migrations/0002_users.sql
-- ======================================================================

-- 0002_users: user layer (PLAN.md section 3) + RLS for everything so far.
-- Airport codes use text + a 3-letter check instead of char(3) to avoid
-- char padding quirks; same constraint, safer comparisons.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  home_airport text check (home_airport ~ '^[A-Z]{3}$'),
  monthly_spend jsonb not null default '{}'::jsonb,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

create table public.user_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  card_id uuid not null references public.card_catalog (id),
  points_balance integer not null default 0 check (points_balance >= 0),
  opened_at date
);

create index user_cards_user_id_idx on public.user_cards (user_id);
create index user_cards_card_id_idx on public.user_cards (card_id);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  origin_airport text not null check (origin_airport ~ '^[A-Z]{3}$'),
  destination_airport text check (destination_airport ~ '^[A-Z]{3}$'),
  destination_region text,
  cabin text not null check (
    cabin in ('economy', 'premium_economy', 'business', 'first')
  ),
  travel_month text check (travel_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  num_travelers integer not null default 1 check (num_travelers > 0),
  flexibility text not null default 'flexible_month'
    check (flexibility in ('exact', 'flexible_month', 'anytime')),
  created_at timestamptz not null default now(),
  -- airport preferred; region is the fallback — at least one must be set
  check (destination_airport is not null or destination_region is not null)
);

create index goals_user_id_idx on public.goals (user_id);

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null unique references public.goals (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  strategies jsonb not null,
  generated_at timestamptz not null default now()
);

create index plans_user_id_idx on public.plans (user_id);

-- Admin check for RLS policies. SECURITY DEFINER so reference-table policies
-- can read profiles without tripping profiles' own RLS.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;

-- Auto-create a profile row on first sign-in.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RLS: user tables are owner-only.

alter table public.profiles enable row level security;
alter table public.user_cards enable row level security;
alter table public.goals enable row level security;
alter table public.plans enable row level security;

create policy "own profile read" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "own profile update" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (
    id = (select auth.uid()) and (role = 'user' or public.is_admin())
  );

create policy "own cards" on public.user_cards
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "own goals" on public.goals
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "own plans" on public.plans
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update, delete on
  public.user_cards,
  public.goals,
  public.plans
to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on
  public.profiles,
  public.user_cards,
  public.goals,
  public.plans
to service_role;

-- ---------------------------------------------------------------------------
-- RLS: reference tables (created deny-all in 0001) — readable by any
-- authenticated user, writable by admins only.

create policy "authenticated read" on public.currencies
  for select to authenticated using (true);
create policy "authenticated read" on public.card_catalog
  for select to authenticated using (true);
create policy "authenticated read" on public.earning_rates
  for select to authenticated using (true);
create policy "authenticated read" on public.welcome_offers
  for select to authenticated using (true);
create policy "authenticated read" on public.transfer_partners
  for select to authenticated using (true);
create policy "authenticated read" on public.transfer_bonuses
  for select to authenticated using (true);
create policy "authenticated read" on public.award_routes
  for select to authenticated using (true);
create policy "authenticated read" on public.airports
  for select to authenticated using (true);

create policy "admin write" on public.currencies
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin write" on public.card_catalog
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin write" on public.earning_rates
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin write" on public.welcome_offers
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin write" on public.transfer_partners
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin write" on public.transfer_bonuses
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin write" on public.award_routes
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin write" on public.airports
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant insert, update, delete on
  public.currencies,
  public.card_catalog,
  public.earning_rates,
  public.welcome_offers,
  public.transfer_partners,
  public.transfer_bonuses,
  public.award_routes,
  public.airports
to authenticated;


-- ======================================================================
-- supabase/migrations/0003_pipeline.sql
-- ======================================================================

-- 0003_pipeline: ingestion layer (PLAN.md section 3). Admin-only, except
-- availability_cache which authenticated users may read (the engine
-- annotates candidate routes with it).

-- Draft -> review -> publish: every AI-proposed change lands here first.
create table public.staging_changes (
  id uuid primary key default gen_random_uuid(),
  target_table text not null,
  target_id uuid,                    -- null = proposed insert
  proposed jsonb not null,
  diff jsonb,
  source text not null check (
    source in ('claude_research', 'gemini', 'seats_aero', 'manual')
  ),
  confidence numeric check (confidence >= 0 and confidence <= 1),
  source_urls text[],
  status text not null default 'pending' check (
    status in ('pending', 'approved', 'rejected', 'auto_applied')
  ),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles (id)
);

create index staging_changes_status_idx on public.staging_changes (status);
create index staging_changes_target_table_idx
  on public.staging_changes (target_table);

create table public.ingest_runs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (
    status in ('running', 'succeeded', 'failed')
  ),
  stats jsonb,
  error text
);

create index ingest_runs_job_name_idx on public.ingest_runs (job_name);

-- The only true zero-touch table: live award seats from Seats.aero.
create table public.availability_cache (
  id uuid primary key default gen_random_uuid(),
  award_route_id uuid not null
    references public.award_routes (id) on delete cascade,
  date date not null,
  cabin text not null check (
    cabin in ('economy', 'premium_economy', 'business', 'first')
  ),
  seats_available integer not null default 0 check (seats_available >= 0),
  source text not null default 'seats_aero',
  fetched_at timestamptz not null default now(),
  unique (award_route_id, date, cabin)
);

create index availability_cache_route_date_idx
  on public.availability_cache (award_route_id, date);

alter table public.staging_changes enable row level security;
alter table public.ingest_runs enable row level security;
alter table public.availability_cache enable row level security;

create policy "admin all" on public.staging_changes
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin all" on public.ingest_runs
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin write" on public.availability_cache
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "authenticated read" on public.availability_cache
  for select to authenticated using (true);

grant select, insert, update, delete on
  public.staging_changes,
  public.ingest_runs,
  public.availability_cache
to authenticated;

grant select, insert, update, delete on
  public.staging_changes,
  public.ingest_runs,
  public.availability_cache
to service_role;


-- ======================================================================
-- supabase/migrations/0004_admin.sql
-- ======================================================================

-- 0004_admin: server-side apply/reject for the review queue (PLAN.md §3, §6).
-- Both functions are SECURITY DEFINER and self-check public.is_admin(), so
-- they can be granted to `authenticated` while still refusing non-admins.
-- The target table is matched against a hard-coded whitelist via literal
-- per-table branches — a table name from `staging_changes.target_table` is
-- NEVER interpolated into SQL.

create or replace function public.apply_staging_change(change_id uuid)
returns public.staging_changes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_change public.staging_changes;
  v_proposed jsonb;
  v_new_id uuid;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;

  select * into v_change from public.staging_changes where id = change_id;
  if not found then
    raise exception 'staging change % not found', change_id;
  end if;
  if v_change.status <> 'pending' then
    raise exception 'staging change % is not pending (status=%)',
      change_id, v_change.status;
  end if;

  if v_change.target_table not in (
    'currencies', 'card_catalog', 'earning_rates', 'welcome_offers',
    'transfer_partners', 'transfer_bonuses', 'award_routes'
  ) then
    raise exception 'table % is not whitelisted', v_change.target_table;
  end if;

  v_proposed := v_change.proposed;

  if v_change.target_id is null then
    -- INSERT: generate an id when the proposal omits one. The proposal must
    -- otherwise be a complete record (the zod layer enforces this before we
    -- get here; this function is the last line of defense, not the first).
    if v_proposed ? 'id' and nullif(v_proposed->>'id', '') is not null then
      v_new_id := (v_proposed->>'id')::uuid;
    else
      v_new_id := gen_random_uuid();
      v_proposed := v_proposed || jsonb_build_object('id', v_new_id);
    end if;

    if v_change.target_table = 'currencies' then
      insert into public.currencies
        select * from jsonb_populate_record(null::public.currencies, v_proposed);
    elsif v_change.target_table = 'card_catalog' then
      insert into public.card_catalog
        select * from jsonb_populate_record(null::public.card_catalog, v_proposed);
    elsif v_change.target_table = 'earning_rates' then
      insert into public.earning_rates
        select * from jsonb_populate_record(null::public.earning_rates, v_proposed);
    elsif v_change.target_table = 'welcome_offers' then
      insert into public.welcome_offers
        select * from jsonb_populate_record(null::public.welcome_offers, v_proposed);
    elsif v_change.target_table = 'transfer_partners' then
      insert into public.transfer_partners
        select * from jsonb_populate_record(null::public.transfer_partners, v_proposed);
    elsif v_change.target_table = 'transfer_bonuses' then
      insert into public.transfer_bonuses
        select * from jsonb_populate_record(null::public.transfer_bonuses, v_proposed);
    elsif v_change.target_table = 'award_routes' then
      insert into public.award_routes
        select * from jsonb_populate_record(null::public.award_routes, v_proposed);
    end if;

  else
    -- UPDATE: start from the existing row so keys absent from `proposed`
    -- keep their current values, then overwrite with proposed keys.
    v_new_id := v_change.target_id;

    if v_change.target_table = 'currencies' then
      update public.currencies t set
        name = x.name, kind = x.kind, alliance = x.alliance,
        cashback_cpp = x.cashback_cpp, transfer_cpp = x.transfer_cpp,
        requires_unlock = x.requires_unlock, is_active = x.is_active,
        notes = x.notes
      from jsonb_populate_record(
        (select c from public.currencies c where c.id = v_change.target_id),
        v_proposed
      ) x
      where t.id = v_change.target_id;
    elsif v_change.target_table = 'card_catalog' then
      update public.card_catalog t set
        name = x.name, issuer = x.issuer, currency_id = x.currency_id,
        annual_fee = x.annual_fee, unlocks_transfers = x.unlocks_transfers,
        affiliate_url = x.affiliate_url, application_rules = x.application_rules,
        is_active = x.is_active, discontinued_at = x.discontinued_at,
        notes = x.notes
      from jsonb_populate_record(
        (select c from public.card_catalog c where c.id = v_change.target_id),
        v_proposed
      ) x
      where t.id = v_change.target_id;
    elsif v_change.target_table = 'earning_rates' then
      update public.earning_rates t set
        card_id = x.card_id, category = x.category, rate = x.rate,
        cap_monthly_usd = x.cap_monthly_usd, notes = x.notes
      from jsonb_populate_record(
        (select c from public.earning_rates c where c.id = v_change.target_id),
        v_proposed
      ) x
      where t.id = v_change.target_id;
    elsif v_change.target_table = 'welcome_offers' then
      update public.welcome_offers t set
        card_id = x.card_id, points = x.points, min_spend_usd = x.min_spend_usd,
        window_months = x.window_months, ends_at = x.ends_at,
        source_url = x.source_url, is_active = x.is_active
      from jsonb_populate_record(
        (select c from public.welcome_offers c where c.id = v_change.target_id),
        v_proposed
      ) x
      where t.id = v_change.target_id;
    elsif v_change.target_table = 'transfer_partners' then
      update public.transfer_partners t set
        from_currency_id = x.from_currency_id, to_currency_id = x.to_currency_id,
        ratio_num = x.ratio_num, ratio_den = x.ratio_den,
        transfer_hours_est = x.transfer_hours_est, min_transfer = x.min_transfer,
        increment = x.increment, is_active = x.is_active, notes = x.notes
      from jsonb_populate_record(
        (select c from public.transfer_partners c where c.id = v_change.target_id),
        v_proposed
      ) x
      where t.id = v_change.target_id;
    elsif v_change.target_table = 'transfer_bonuses' then
      update public.transfer_bonuses t set
        transfer_partner_id = x.transfer_partner_id, bonus_pct = x.bonus_pct,
        starts_at = x.starts_at, ends_at = x.ends_at,
        source_url = x.source_url, status = x.status
      from jsonb_populate_record(
        (select c from public.transfer_bonuses c where c.id = v_change.target_id),
        v_proposed
      ) x
      where t.id = v_change.target_id;
    elsif v_change.target_table = 'award_routes' then
      update public.award_routes t set
        name = x.name, program_currency_id = x.program_currency_id,
        origin_region = x.origin_region, origin_airports = x.origin_airports,
        destination_region = x.destination_region,
        destination_airports = x.destination_airports, cabin = x.cabin,
        points_oneway = x.points_oneway,
        taxes_fees_usd_est = x.taxes_fees_usd_est, booking_url = x.booking_url,
        notes = x.notes, is_active = x.is_active,
        last_verified_at = x.last_verified_at
      from jsonb_populate_record(
        (select c from public.award_routes c where c.id = v_change.target_id),
        v_proposed
      ) x
      where t.id = v_change.target_id;
    end if;

    if not found then
      raise exception 'target row % in % not found',
        v_change.target_id, v_change.target_table;
    end if;
  end if;

  update public.staging_changes set
    status = 'approved',
    target_id = coalesce(target_id, v_new_id),
    reviewed_at = now(),
    reviewed_by = auth.uid()
  where id = change_id
  returning * into v_change;

  return v_change;
end;
$$;

create or replace function public.reject_staging_change(change_id uuid)
returns public.staging_changes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_change public.staging_changes;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;

  select * into v_change from public.staging_changes where id = change_id;
  if not found then
    raise exception 'staging change % not found', change_id;
  end if;
  if v_change.status <> 'pending' then
    raise exception 'staging change % is not pending (status=%)',
      change_id, v_change.status;
  end if;

  update public.staging_changes set
    status = 'rejected',
    reviewed_at = now(),
    reviewed_by = auth.uid()
  where id = change_id
  returning * into v_change;

  return v_change;
end;
$$;

revoke execute on function public.apply_staging_change(uuid) from public, anon;
revoke execute on function public.reject_staging_change(uuid) from public, anon;
grant execute on function public.apply_staging_change(uuid) to authenticated, service_role;
grant execute on function public.reject_staging_change(uuid) to authenticated, service_role;


-- ======================================================================
-- supabase/migrations/0005_legs.sql
-- ======================================================================

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
-- goal_legs, now the sole source of truth for the itinerary. The backfill above
-- already read their current values (all still populated for any pre-0005 row),
-- so we can now relax the constraints that only govern FUTURE inserts. Migration
-- 0002 made origin_airport and cabin NOT NULL and added a cross-column check
-- requiring a destination — from before legs existed. Drop all three so a new
-- goal writes only title/num_travelers/flexibility here and its goal_legs rows
-- carry the itinerary. (0001-0004 are frozen; these ALTERs live in 0005, which
-- has never been applied to any hosted project.) Postgres can't express "a goal
-- has a valid leg 1" across tables, so the app inserts goals + goal_legs in one
-- transaction and rolls the goal back if the legs insert fails.
alter table public.goals
  alter column origin_airport drop not null,
  alter column cabin drop not null;

-- The "destination_airport is not null or destination_region is not null" check
-- (goals_check), looked up by definition rather than a guessed name.
alter table public.goals drop constraint goals_check;

comment on column public.goals.origin_airport is
  'Nullable & deprecated (0005): read goal_legs instead; new code never writes it.';
comment on column public.goals.destination_airport is
  'Nullable & deprecated (0005): read goal_legs instead; new code never writes it.';
comment on column public.goals.destination_region is
  'Nullable & deprecated (0005): read goal_legs instead; new code never writes it.';
comment on column public.goals.cabin is
  'Nullable & deprecated (0005): read goal_legs instead; new code never writes it.';
comment on column public.goals.travel_month is
  'Nullable & deprecated (0005): read goal_legs instead; new code never writes it.';

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
