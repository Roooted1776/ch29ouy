#!/usr/bin/env bash
# Reruns app/test/local-supabase.test.ts (refused direct sign-up, spare-admin reset, refused setup)
# against a LOCAL Supabase stack only. Never touches the real project and never changes the
# committed supabase/config.toml: it starts the stack from a scratch copy of supabase/ with
# migrations enabled and auto-expose on, refuses any API URL that is not localhost, keeps the
# local keys in environment variables only (never printed), and stops the stack at the end.
# Needs Docker and the Supabase CLI (`supabase`, or set SUPABASE_BIN), plus `npm ci` in app/.
#
#   bash supabase/tests/run-local-stack.sh
set -euo pipefail
repo="$(cd "$(dirname "$0")/../.." && pwd)"
sb="${SUPABASE_BIN:-supabase}"
command -v "$sb" >/dev/null || { echo "Supabase CLI not found (set SUPABASE_BIN)" >&2; exit 1; }

scratch="$(mktemp -d "${TMPDIR:-/tmp}/brain-local-stack.XXXXXX")"
started=0
# Cleanup is armed right after mktemp, so a failed sed/grep below still removes the scratch folder.
# The stack is only stopped if this script started it (from the scratch copy's unique project_id).
stop() {
  if [ "$started" = 1 ]; then
    (cd "$scratch" && "$sb" stop --no-backup >/dev/null 2>&1) || true
  fi
  rm -rf "$scratch"
}
trap stop EXIT
cp -R "$repo/supabase" "$scratch/supabase"
cfg="$scratch/supabase/config.toml"
# Scratch-only edits: apply the migrations on start and let the local API see the tables.
sed -i.bak -e '/^\[db\.migrations\]/,/^\[/ s/^enabled = false/enabled = true/' \
  -e 's/^auto_expose_new_tables = false/auto_expose_new_tables = true/' \
  -e "s/^project_id = .*/project_id = \"brain-local-check-$$\"/" "$cfg"
grep -q "^project_id = \"brain-local-check-$$\"" "$cfg" || { echo "could not set a unique project_id in the scratch copy" >&2; exit 1; }
grep -q '^enabled = true' <(sed -n '/^\[db\.migrations\]/,/^\[/p' "$cfg") || { echo "could not enable migrations in the scratch copy" >&2; exit 1; }

cd "$scratch"
echo "starting a local Supabase stack from $scratch (output hidden; it contains local keys)"
started=1
if ! "$sb" start >"$scratch/start.log" 2>&1; then
  # Drop any line naming a key/secret/token/password, then redact what is left.
  tail -n 20 "$scratch/start.log" \
    | grep -viE 'key|secret|token|password' \
    | sed -E -e 's/eyJ[A-Za-z0-9._-]*/[redacted]/g' \
      -e 's/sb_secret_[A-Za-z0-9_-]*/[redacted]/g' \
      -e 's/sb_publishable_[A-Za-z0-9_-]*/[redacted]/g' \
      -e 's/((key|secret|password)=)[^[:space:]]*/\1[redacted]/gI' \
      -e 's#(://[^:/@]+:)[^@]+@#\1[redacted]@#g' >&2 || true
  echo "supabase start failed" >&2
  exit 1
fi

env_out="$("$sb" status -o env 2>/dev/null)"
val() { printf '%s\n' "$env_out" | sed -n "s/^$1=\"\{0,1\}\([^\"]*\)\"\{0,1\}$/\1/p" | head -n1; }
api_url="$(val API_URL)"
anon_key="$(val ANON_KEY)"
service_key="$(val SERVICE_ROLE_KEY)"
unset env_out
if ! [[ "$api_url" =~ ^http://(127\.0\.0\.1|localhost):[0-9]+$ ]]; then
  echo "refusing to run: the API URL is not a local stack ($api_url)" >&2
  exit 1
fi
if [ -z "$anon_key" ] || [ -z "$service_key" ]; then
  echo "local keys missing from supabase status" >&2
  exit 1
fi
echo "local API at $api_url"

cd "$repo/app"
BRAIN_LOCAL_SUPABASE_URL="$api_url" BRAIN_LOCAL_ANON_KEY="$anon_key" BRAIN_LOCAL_SERVICE_KEY="$service_key" \
  npx vitest run test/local-supabase.test.ts
