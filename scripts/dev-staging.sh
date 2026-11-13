#!/usr/bin/env bash
# Lokale Entwicklung gegen die Staging-Datenbank (Paket 102) - "npm run dev".
# Gegen Live nur noch bewusst: "npm run dev:live".
#
# Next.js überschreibt keine Variablen, die beim Start schon gesetzt sind. Deshalb:
# Werte aus .env.staging setzen und jeden weiteren Schlüssel aus .env.local (Meta, Close,
# Leadtable, Kanzleistelle24, KI ...) leer setzen. So greift die lokale Entwicklung weder auf
# die Live-Datenbank noch auf echte Anbindungen zu.
set -euo pipefail
cd "$(dirname "$0")/.."
[[ -f .env.staging ]] || { echo ".env.staging fehlt - siehe docs/launch/staging.md. Gegen Live: npm run dev:live"; exit 1; }
staging_url=$(grep -E '^NEXT_PUBLIC_SUPABASE_URL=' .env.staging | cut -d= -f2- || true)
live_url=$(grep -E '^NEXT_PUBLIC_SUPABASE_URL=' .env.local 2>/dev/null | cut -d= -f2- || true)
[[ -n "$staging_url" ]] || { echo "NEXT_PUBLIC_SUPABASE_URL fehlt in .env.staging"; exit 1; }
[[ "$staging_url" != "$live_url" ]] || { echo ".env.staging zeigt auf die Live-Datenbank - Abbruch."; exit 1; }

staging_keys=$(grep -oE '^[A-Z0-9_]+' .env.staging | sort -u)
if [[ -f .env.local ]]; then
  for key in $(grep -oE '^[A-Z0-9_]+' .env.local | sort -u); do
    grep -qx "$key" <<<"$staging_keys" || export "$key="
  done
fi
set -a; source .env.staging; set +a
export APP_ENV=staging
export NEXT_PUBLIC_APP_URL="http://localhost:${PORT:-3000}"
exec npx next dev "$@"
