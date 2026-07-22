#!/usr/bin/env bash
# Apply supabase/migrations/*.sql, in order, against DATABASE_URL.
#
# This is the Docker-less alternative to `supabase db reset` (which needs a
# local Docker Supabase stack). Point it at a hosted Supabase project's
# direct Postgres connection string to migrate that project instead of
# local — see README.md "Using a hosted Supabase project".
#
# Do NOT apply scripts/ci/supabase-shim.sql before this against a real
# Supabase project: that shim fakes the auth schema/roles for plain
# Postgres in CI, and a real Supabase project already has them for real.
set -euo pipefail

DB_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"

if ! command -v psql >/dev/null 2>&1; then
  echo "error: psql not found on PATH (install the postgresql-client package)" >&2
  exit 1
fi

for f in supabase/migrations/*.sql; do
  echo "== $f"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$f"
done

echo "migrations applied"
