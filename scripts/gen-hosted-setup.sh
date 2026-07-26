#!/usr/bin/env bash
# Generate deploy/hosted-setup.sql from supabase/migrations/*.sql.
#
# hosted-setup.sql is the whole schema as one paste-and-run bundle for the
# Supabase SQL Editor (no local tooling). It is a mechanical concatenation of
# the migrations — never hand-edit it; edit a migration and re-run this script.
# CI regenerates it and fails on drift (see .github/workflows/ci.yml).
set -euo pipefail

cd "$(dirname "$0")/.."

OUT=deploy/hosted-setup.sql
MIGRATIONS=(supabase/migrations/*.sql)

{
  cat <<'HEADER'
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
HEADER

  for f in "${MIGRATIONS[@]}"; do
    printf '\n\n-- ======================================================================\n'
    printf -- '-- %s\n' "$f"
    printf -- '-- ======================================================================\n\n'
    cat "$f"
  done
} > "$OUT"

echo "wrote $OUT from ${#MIGRATIONS[@]} migrations"
