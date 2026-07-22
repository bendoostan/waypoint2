-- Waypoint — one-shot hosted-project setup for the Supabase SQL Editor.
--
-- Run this ONCE against a fresh Supabase project (Dashboard -> SQL Editor ->
-- New query -> paste -> Run). It creates the full schema (migrations
-- 0001-0004) and seeds the reference graph + example review-queue items, so
-- the deployed app has data to show without any local tooling.
--
-- A real Supabase project already provides the auth schema, auth.uid(), and
-- the anon/authenticated/service_role roles these migrations rely on — so do
-- NOT run scripts/ci/supabase-shim.sql here (that is only for plain Postgres
-- in CI). Run this on a fresh project; re-running it on a populated one will
-- error on the CREATE TABLE statements.
--
-- Airports (~4,000 rows) are intentionally left out — they are for the
-- Phase 3 consumer app, not the admin portal. Load them later with
-- `pnpm seed` once you have Node + a DATABASE_URL, if you want them.

-- ========================================================================
-- SCHEMA (migrations 0001_reference -> 0004_admin)
-- ========================================================================


-- ---- supabase/migrations/0001_reference.sql ----
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

-- ---- supabase/migrations/0002_users.sql ----
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

-- ---- supabase/migrations/0003_pipeline.sql ----
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

-- ---- supabase/migrations/0004_admin.sql ----
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

-- ========================================================================
-- SEED (reference graph + example staging_changes; no airports)
-- ========================================================================

INSERT INTO public.currencies (id, name, kind, alliance, cashback_cpp, transfer_cpp, requires_unlock, is_active, notes) VALUES ('11111111-1111-4111-8111-000000000001', 'Chase Ultimate Rewards', 'bank', NULL, 1, 2, true, true, 'seed');
INSERT INTO public.currencies (id, name, kind, alliance, cashback_cpp, transfer_cpp, requires_unlock, is_active, notes) VALUES ('11111111-1111-4111-8111-000000000002', 'Amex Membership Rewards', 'bank', NULL, 0.6, 2, true, true, 'seed');
INSERT INTO public.currencies (id, name, kind, alliance, cashback_cpp, transfer_cpp, requires_unlock, is_active, notes) VALUES ('11111111-1111-4111-8111-000000000003', 'Capital One Miles', 'bank', NULL, 0.5, 1.7, false, true, 'seed');
INSERT INTO public.currencies (id, name, kind, alliance, cashback_cpp, transfer_cpp, requires_unlock, is_active, notes) VALUES ('11111111-1111-4111-8111-000000000004', 'United MileagePlus', 'airline', 'star', 0, 1.3, false, true, 'seed');
INSERT INTO public.currencies (id, name, kind, alliance, cashback_cpp, transfer_cpp, requires_unlock, is_active, notes) VALUES ('11111111-1111-4111-8111-000000000005', 'Air Canada Aeroplan', 'airline', 'star', 0, 1.5, false, true, 'seed');
INSERT INTO public.currencies (id, name, kind, alliance, cashback_cpp, transfer_cpp, requires_unlock, is_active, notes) VALUES ('11111111-1111-4111-8111-000000000006', 'Air France-KLM Flying Blue', 'airline', 'skyteam', 0, 1.3, false, true, 'seed');
INSERT INTO public.currencies (id, name, kind, alliance, cashback_cpp, transfer_cpp, requires_unlock, is_active, notes) VALUES ('11111111-1111-4111-8111-000000000007', 'ANA Mileage Club', 'airline', 'star', 0, 1.8, false, true, 'seed');
INSERT INTO public.currencies (id, name, kind, alliance, cashback_cpp, transfer_cpp, requires_unlock, is_active, notes) VALUES ('11111111-1111-4111-8111-000000000008', 'Singapore KrisFlyer', 'airline', 'star', 0, 1.4, false, true, 'seed');
INSERT INTO public.currencies (id, name, kind, alliance, cashback_cpp, transfer_cpp, requires_unlock, is_active, notes) VALUES ('11111111-1111-4111-8111-000000000009', 'British Airways Avios', 'airline', 'oneworld', 0, 1.4, false, true, 'seed');
INSERT INTO public.award_routes (id, name, program_currency_id, origin_region, origin_airports, destination_region, destination_airports, cabin, points_oneway, taxes_fees_usd_est, booking_url, notes, is_active, last_verified_at) VALUES ('5ec43858-f471-482a-b7eb-b07d18820493', 'ANA business class to Japan (round-trip)', '11111111-1111-4111-8111-000000000007', 'US West Coast', '{LAX,SFO,SEA}', 'Japan', '{NRT,HND}', 'business', 42500, 250, 'https://www.ana.co.jp/en/us/amc/', 'seed; ANA books round-trip only — points_oneway is half the RT price', true, NULL);
INSERT INTO public.award_routes (id, name, program_currency_id, origin_region, origin_airports, destination_region, destination_airports, cabin, points_oneway, taxes_fees_usd_est, booking_url, notes, is_active, last_verified_at) VALUES ('981b5f19-0a63-4741-a494-c08b62fc434a', 'Flying Blue economy to Europe', '11111111-1111-4111-8111-000000000006', 'US East Coast', '{JFK,BOS,IAD}', 'Europe', '{CDG,AMS}', 'economy', 20000, 120, 'https://www.flyingblue.com/', 'seed', true, NULL);
INSERT INTO public.award_routes (id, name, program_currency_id, origin_region, origin_airports, destination_region, destination_airports, cabin, points_oneway, taxes_fees_usd_est, booking_url, notes, is_active, last_verified_at) VALUES ('a08fd4db-64b2-4019-a5df-4588a171fc1f', 'United economy to Hawaii', '11111111-1111-4111-8111-000000000004', 'US West Coast', '{LAX,SFO,SAN}', 'Hawaii', '{HNL,OGG}', 'economy', 22500, 6, 'https://www.united.com/', 'seed', true, NULL);
INSERT INTO public.card_catalog (id, name, issuer, currency_id, annual_fee, unlocks_transfers, affiliate_url, application_rules, is_active, discontinued_at, notes) VALUES ('22222222-2222-4222-8222-000000000001', 'Sapphire Preferred', 'Chase', '11111111-1111-4111-8111-000000000001', 95, true, NULL, NULL, true, NULL, 'seed');
INSERT INTO public.card_catalog (id, name, issuer, currency_id, annual_fee, unlocks_transfers, affiliate_url, application_rules, is_active, discontinued_at, notes) VALUES ('22222222-2222-4222-8222-000000000002', 'Freedom Unlimited', 'Chase', '11111111-1111-4111-8111-000000000001', 0, false, NULL, NULL, true, NULL, 'seed');
INSERT INTO public.card_catalog (id, name, issuer, currency_id, annual_fee, unlocks_transfers, affiliate_url, application_rules, is_active, discontinued_at, notes) VALUES ('22222222-2222-4222-8222-000000000003', 'Gold Card', 'American Express', '11111111-1111-4111-8111-000000000002', 325, true, NULL, NULL, true, NULL, 'seed');
INSERT INTO public.card_catalog (id, name, issuer, currency_id, annual_fee, unlocks_transfers, affiliate_url, application_rules, is_active, discontinued_at, notes) VALUES ('22222222-2222-4222-8222-000000000004', 'Venture X', 'Capital One', '11111111-1111-4111-8111-000000000003', 395, true, NULL, NULL, true, NULL, 'seed');
INSERT INTO public.card_catalog (id, name, issuer, currency_id, annual_fee, unlocks_transfers, affiliate_url, application_rules, is_active, discontinued_at, notes) VALUES ('22222222-2222-4222-8222-000000000005', 'United Explorer', 'Chase', '11111111-1111-4111-8111-000000000004', 95, false, NULL, NULL, true, NULL, 'seed');
INSERT INTO public.earning_rates (id, card_id, category, rate, cap_monthly_usd, notes) VALUES ('1f575dbf-1951-42a3-aaf8-2639e44b08e4', '22222222-2222-4222-8222-000000000001', 'dining', 3, NULL, 'seed');
INSERT INTO public.earning_rates (id, card_id, category, rate, cap_monthly_usd, notes) VALUES ('a8dc94a9-81e4-4aa9-a61b-0fc4f542bfdc', '22222222-2222-4222-8222-000000000001', 'travel', 2, NULL, 'seed');
INSERT INTO public.earning_rates (id, card_id, category, rate, cap_monthly_usd, notes) VALUES ('fac0cebb-2735-47d2-8dcc-c137681754f9', '22222222-2222-4222-8222-000000000001', 'streaming', 3, NULL, 'seed');
INSERT INTO public.earning_rates (id, card_id, category, rate, cap_monthly_usd, notes) VALUES ('5cf8c537-1d83-4c58-8a61-7e91810a9ce4', '22222222-2222-4222-8222-000000000001', 'online_retail', 3, NULL, 'seed');
INSERT INTO public.earning_rates (id, card_id, category, rate, cap_monthly_usd, notes) VALUES ('ba874d5b-f663-4ace-b9a4-579e471f37e4', '22222222-2222-4222-8222-000000000001', 'everything_else', 1, NULL, 'seed');
INSERT INTO public.earning_rates (id, card_id, category, rate, cap_monthly_usd, notes) VALUES ('3cdc67b6-866a-4174-a30a-7187835243a8', '22222222-2222-4222-8222-000000000002', 'dining', 3, NULL, 'seed');
INSERT INTO public.earning_rates (id, card_id, category, rate, cap_monthly_usd, notes) VALUES ('dd55aeef-855d-4fdb-a7ca-64d0bcae4d8e', '22222222-2222-4222-8222-000000000002', 'drugstore', 3, NULL, 'seed');
INSERT INTO public.earning_rates (id, card_id, category, rate, cap_monthly_usd, notes) VALUES ('e3ef9dfb-a5cf-4e9c-8938-4e1ef8f3f499', '22222222-2222-4222-8222-000000000002', 'travel', 5, NULL, 'seed; Chase Travel portal only');
INSERT INTO public.earning_rates (id, card_id, category, rate, cap_monthly_usd, notes) VALUES ('1f2b73e2-caa9-4be6-957f-17b53d464e0e', '22222222-2222-4222-8222-000000000002', 'everything_else', 1.5, NULL, 'seed');
INSERT INTO public.earning_rates (id, card_id, category, rate, cap_monthly_usd, notes) VALUES ('cea87a87-ce2f-47de-b0aa-fafb16a5a293', '22222222-2222-4222-8222-000000000003', 'dining', 4, 4166, 'seed; $50k/yr cap approximated monthly');
INSERT INTO public.earning_rates (id, card_id, category, rate, cap_monthly_usd, notes) VALUES ('c73f7970-c4e9-4386-81d0-3822627797d6', '22222222-2222-4222-8222-000000000003', 'groceries', 4, 2083, 'seed; $25k/yr cap approximated monthly');
INSERT INTO public.earning_rates (id, card_id, category, rate, cap_monthly_usd, notes) VALUES ('622651e4-b732-4ac1-a46d-ed117c9ca2e5', '22222222-2222-4222-8222-000000000003', 'travel', 3, NULL, 'seed; flights booked direct');
INSERT INTO public.earning_rates (id, card_id, category, rate, cap_monthly_usd, notes) VALUES ('f1e031b2-b4ef-45b2-80fd-d508b9e0558a', '22222222-2222-4222-8222-000000000003', 'everything_else', 1, NULL, 'seed');
INSERT INTO public.earning_rates (id, card_id, category, rate, cap_monthly_usd, notes) VALUES ('90201870-f209-4786-80ab-b4c863004160', '22222222-2222-4222-8222-000000000004', 'travel', 5, NULL, 'seed; Capital One Travel portal');
INSERT INTO public.earning_rates (id, card_id, category, rate, cap_monthly_usd, notes) VALUES ('1a6e84ef-d35d-463c-8054-1dfd53a526bf', '22222222-2222-4222-8222-000000000004', 'everything_else', 2, NULL, 'seed');
INSERT INTO public.earning_rates (id, card_id, category, rate, cap_monthly_usd, notes) VALUES ('0c92e494-938e-4eb4-9320-4533c3eb5e5e', '22222222-2222-4222-8222-000000000005', 'dining', 2, NULL, 'seed');
INSERT INTO public.earning_rates (id, card_id, category, rate, cap_monthly_usd, notes) VALUES ('3acf1f40-29d5-4ccf-a1d9-1737ab284ab2', '22222222-2222-4222-8222-000000000005', 'travel', 2, NULL, 'seed; United purchases');
INSERT INTO public.earning_rates (id, card_id, category, rate, cap_monthly_usd, notes) VALUES ('c832bc0e-a592-4f21-9abf-5ae0ede8bd74', '22222222-2222-4222-8222-000000000005', 'everything_else', 1, NULL, 'seed');
INSERT INTO public.staging_changes (id, target_table, target_id, proposed, diff, source, confidence, source_urls, status, created_at, reviewed_at, reviewed_by) VALUES ('55555555-5555-4555-8555-000000000001', 'transfer_bonuses', NULL, '"{\"transfer_partner_id\":\"4bdc7165-bf32-415d-9ba3-bfea36bc2da4\",\"bonus_pct\":40,\"starts_at\":\"2026-08-15T00:00:00Z\",\"ends_at\":\"2026-10-15T23:59:59Z\",\"source_url\":\"https://www.americanexpress.com/transfer-bonus\",\"status\":\"draft\"}"', NULL, 'claude_research', 0.86, '{https://www.americanexpress.com/transfer-bonus,https://frequentmiler.com/amex-transfer-bonuses/}', 'pending', '2026-07-22 10:35:54.541075+00', NULL, NULL);
INSERT INTO public.staging_changes (id, target_table, target_id, proposed, diff, source, confidence, source_urls, status, created_at, reviewed_at, reviewed_by) VALUES ('55555555-5555-4555-8555-000000000002', 'currencies', '11111111-1111-4111-8111-000000000003', '"{\"transfer_cpp\":1.85}"', '"{\"transfer_cpp\":{\"from\":1.7,\"to\":1.85}}"', 'claude_research', 0.7, '{https://thepointsguy.com/loyalty-programs/points-valuations/}', 'pending', '2026-07-22 10:35:54.544616+00', NULL, NULL);
INSERT INTO public.staging_changes (id, target_table, target_id, proposed, diff, source, confidence, source_urls, status, created_at, reviewed_at, reviewed_by) VALUES ('55555555-5555-4555-8555-000000000003', 'welcome_offers', '33333333-3333-4333-8333-000000000001', '"{\"points\":75000,\"min_spend_usd\":5000}"', '"{\"points\":{\"from\":60000,\"to\":75000},\"min_spend_usd\":{\"from\":4000,\"to\":5000}}"', 'manual', 0.95, '{https://www.chase.com/sapphire-preferred}', 'pending', '2026-07-22 10:35:54.546006+00', NULL, NULL);
INSERT INTO public.transfer_partners (id, from_currency_id, to_currency_id, ratio_num, ratio_den, transfer_hours_est, min_transfer, increment, is_active, notes) VALUES ('9d123765-4e06-4de1-8698-1f3dcb63074c', '11111111-1111-4111-8111-000000000001', '11111111-1111-4111-8111-000000000004', 1, 1, 0, 1000, 1000, true, 'seed');
INSERT INTO public.transfer_partners (id, from_currency_id, to_currency_id, ratio_num, ratio_den, transfer_hours_est, min_transfer, increment, is_active, notes) VALUES ('40d5b63e-cf35-44f4-8be1-892565581f2f', '11111111-1111-4111-8111-000000000001', '11111111-1111-4111-8111-000000000005', 1, 1, 0, 1000, 1000, true, 'seed');
INSERT INTO public.transfer_partners (id, from_currency_id, to_currency_id, ratio_num, ratio_den, transfer_hours_est, min_transfer, increment, is_active, notes) VALUES ('928e9e5a-6999-4707-a789-893acf38533b', '11111111-1111-4111-8111-000000000001', '11111111-1111-4111-8111-000000000006', 1, 1, 0, 1000, 1000, true, 'seed');
INSERT INTO public.transfer_partners (id, from_currency_id, to_currency_id, ratio_num, ratio_den, transfer_hours_est, min_transfer, increment, is_active, notes) VALUES ('49c0c5c9-5053-4f19-afed-80888b021459', '11111111-1111-4111-8111-000000000001', '11111111-1111-4111-8111-000000000008', 1, 1, 24, 1000, 1000, true, 'seed');
INSERT INTO public.transfer_partners (id, from_currency_id, to_currency_id, ratio_num, ratio_den, transfer_hours_est, min_transfer, increment, is_active, notes) VALUES ('3a2d5f0b-79c0-42f7-88f2-f5178f755343', '11111111-1111-4111-8111-000000000001', '11111111-1111-4111-8111-000000000009', 1, 1, 0, 1000, 1000, true, 'seed');
INSERT INTO public.transfer_partners (id, from_currency_id, to_currency_id, ratio_num, ratio_den, transfer_hours_est, min_transfer, increment, is_active, notes) VALUES ('4bdc7165-bf32-415d-9ba3-bfea36bc2da4', '11111111-1111-4111-8111-000000000002', '11111111-1111-4111-8111-000000000007', 1, 1, 48, 1000, 1000, true, 'seed');
INSERT INTO public.transfer_partners (id, from_currency_id, to_currency_id, ratio_num, ratio_den, transfer_hours_est, min_transfer, increment, is_active, notes) VALUES ('e8a07349-6b15-4500-b062-7abe67bebc60', '11111111-1111-4111-8111-000000000002', '11111111-1111-4111-8111-000000000005', 1, 1, 0, 1000, 1000, true, 'seed');
INSERT INTO public.transfer_partners (id, from_currency_id, to_currency_id, ratio_num, ratio_den, transfer_hours_est, min_transfer, increment, is_active, notes) VALUES ('3e0572bd-eef9-4039-b391-dfd09ca6c181', '11111111-1111-4111-8111-000000000002', '11111111-1111-4111-8111-000000000006', 1, 1, 0, 1000, 1000, true, 'seed');
INSERT INTO public.transfer_partners (id, from_currency_id, to_currency_id, ratio_num, ratio_den, transfer_hours_est, min_transfer, increment, is_active, notes) VALUES ('57b21bc6-19b6-4f31-a647-bed46f9092aa', '11111111-1111-4111-8111-000000000002', '11111111-1111-4111-8111-000000000009', 1, 1, 0, 1000, 1000, true, 'seed');
INSERT INTO public.transfer_partners (id, from_currency_id, to_currency_id, ratio_num, ratio_den, transfer_hours_est, min_transfer, increment, is_active, notes) VALUES ('6644556b-6770-4929-9853-e0ab1805bdc7', '11111111-1111-4111-8111-000000000003', '11111111-1111-4111-8111-000000000005', 1, 1, 0, 1000, 100, true, 'seed');
INSERT INTO public.transfer_partners (id, from_currency_id, to_currency_id, ratio_num, ratio_den, transfer_hours_est, min_transfer, increment, is_active, notes) VALUES ('116a847a-c0cc-449a-877d-e07e07b00de5', '11111111-1111-4111-8111-000000000003', '11111111-1111-4111-8111-000000000006', 1, 1, 0, 1000, 100, true, 'seed');
INSERT INTO public.transfer_partners (id, from_currency_id, to_currency_id, ratio_num, ratio_den, transfer_hours_est, min_transfer, increment, is_active, notes) VALUES ('9cef4a99-2d8a-454d-b104-a13946e989e9', '11111111-1111-4111-8111-000000000003', '11111111-1111-4111-8111-000000000008', 1, 1, 24, 1000, 100, true, 'seed');
INSERT INTO public.transfer_bonuses (id, transfer_partner_id, bonus_pct, starts_at, ends_at, source_url, status) VALUES ('44444444-4444-4444-8444-000000000001', '3e0572bd-eef9-4039-b391-dfd09ca6c181', 25, '2026-07-01 00:00:00+00', '2026-09-15 23:59:59+00', 'seed', 'approved');
INSERT INTO public.welcome_offers (id, card_id, points, min_spend_usd, window_months, ends_at, source_url, is_active) VALUES ('33333333-3333-4333-8333-000000000001', '22222222-2222-4222-8222-000000000001', 60000, 4000, 3, NULL, 'seed', true);
INSERT INTO public.welcome_offers (id, card_id, points, min_spend_usd, window_months, ends_at, source_url, is_active) VALUES ('33333333-3333-4333-8333-000000000002', '22222222-2222-4222-8222-000000000002', 20000, 500, 3, NULL, 'seed', true);
INSERT INTO public.welcome_offers (id, card_id, points, min_spend_usd, window_months, ends_at, source_url, is_active) VALUES ('33333333-3333-4333-8333-000000000003', '22222222-2222-4222-8222-000000000003', 60000, 6000, 6, NULL, 'seed', true);
INSERT INTO public.welcome_offers (id, card_id, points, min_spend_usd, window_months, ends_at, source_url, is_active) VALUES ('33333333-3333-4333-8333-000000000004', '22222222-2222-4222-8222-000000000004', 75000, 4000, 3, NULL, 'seed', true);
INSERT INTO public.welcome_offers (id, card_id, points, min_spend_usd, window_months, ends_at, source_url, is_active) VALUES ('33333333-3333-4333-8333-000000000005', '22222222-2222-4222-8222-000000000005', 50000, 3000, 3, NULL, 'seed', true);
