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
