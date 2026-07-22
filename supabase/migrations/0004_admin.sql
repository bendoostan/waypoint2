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
