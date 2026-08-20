#!/bin/sh
set -e

echo "[startup] container boot"
echo "[startup] PORT=${PORT:-unset}"
echo "[startup] NODE_ENV=${NODE_ENV:-unset}"
echo "[startup] DATABASE_URL set=$([ -n "$DATABASE_URL" ] && echo true || echo false)"
echo "[startup] SUPABASE_URL set=$([ -n "$SUPABASE_URL" ] && echo true || echo false)"
echo "[startup] SUPABASE_SERVICE_ROLE_KEY set=$([ -n "$SUPABASE_SERVICE_ROLE_KEY" ] && echo true || echo false)"

exec node dist/src/main
