-- Admin apply/reject smoke test for CI. Runs AFTER the shim, migrations, and
-- seed. Exercises apply_staging_change end to end under an admin identity and
-- asserts the guard rails. Any failed assertion aborts the transaction (and
-- the CI step) via `raise exception`.
--
-- Uses a DO block so we can stub auth.uid() the way PostgREST would: setting
-- request.jwt.claim.sub to a seeded admin user and running as the
-- `authenticated` role.

\set ON_ERROR_STOP on

begin;

-- A seeded admin identity for is_admin() to key off.
insert into auth.users (id, email)
values ('aaaaaaaa-bbbb-4ccc-8ddd-000000000001', 'ci-admin@waypoint.test')
on conflict (id) do nothing;
update public.profiles
  set role = 'admin'
  where id = 'aaaaaaaa-bbbb-4ccc-8ddd-000000000001';

-- Become that admin for the RPC calls.
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-bbbb-4ccc-8ddd-000000000001';

do $$
declare
  v_currency_id uuid;
  v_old_cpp numeric;
  v_change_id uuid := 'cccccccc-dddd-4eee-8fff-000000000001';
  v_status text;
  v_new_cpp numeric;
begin
  -- Pick a real currency to update and record its current cpp.
  select id, transfer_cpp into v_currency_id, v_old_cpp
  from public.currencies order by name limit 1;

  -- A pending UPDATE proposal bumping transfer_cpp by 1.00.
  insert into public.staging_changes
    (id, target_table, target_id, proposed, source, confidence, status)
  values
    (v_change_id, 'currencies', v_currency_id,
     jsonb_build_object('transfer_cpp', v_old_cpp + 1),
     'manual', 1.0, 'pending')
  on conflict (id) do update set
    target_id = excluded.target_id, proposed = excluded.proposed,
    status = 'pending', reviewed_at = null, reviewed_by = null;

  -- Apply it.
  perform public.apply_staging_change(v_change_id);

  -- The target row must have changed.
  select transfer_cpp into v_new_cpp
  from public.currencies where id = v_currency_id;
  if v_new_cpp <> v_old_cpp + 1 then
    raise exception 'apply did not update target: expected %, got %',
      v_old_cpp + 1, v_new_cpp;
  end if;

  -- The change row must now be approved with review metadata.
  select status into v_status
  from public.staging_changes where id = v_change_id;
  if v_status <> 'approved' then
    raise exception 'change not approved, status = %', v_status;
  end if;

  -- A second apply on the same (now approved) change must raise.
  begin
    perform public.apply_staging_change(v_change_id);
    raise exception 'second apply unexpectedly succeeded';
  exception
    when others then
      if sqlerrm like '%second apply unexpectedly succeeded%' then
        raise;  -- re-raise our own assertion failure
      end if;
      raise notice 'second apply correctly raised: %', sqlerrm;
  end;

  raise notice 'admin smoke: OK';
end $$;

rollback;
