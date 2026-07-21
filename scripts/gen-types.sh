#!/usr/bin/env bash
# Generate src/types/database.ts from the local database schema.
#
# `supabase gen types` needs Docker; this calls the same generator it uses
# (@supabase/postgres-meta) directly, so it also works Docker-less (CI).
set -euo pipefail

DB_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"

PG_META_DB_URL="$DB_URL" \
PG_META_GENERATE_TYPES=typescript \
PG_META_GENERATE_TYPES_INCLUDED_SCHEMAS=public \
  node node_modules/@supabase/postgres-meta/dist/server/server.js \
  > src/types/database.ts

echo "wrote src/types/database.ts"
