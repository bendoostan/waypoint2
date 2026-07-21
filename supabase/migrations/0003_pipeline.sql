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
