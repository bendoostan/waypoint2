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
  with check (id = (select auth.uid()) and role = 'user');

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
