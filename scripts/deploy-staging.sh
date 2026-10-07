#!/usr/bin/env bash
# Staging bauen und deployen (T-99): Worker kandidatenwerk-staging auf workers.dev.
# Lädt .env.staging in die Shell - Next.js überschreibt bereits gesetzte Variablen nicht,
# so landen die NEXT_PUBLIC_*-Werte des Staging-Supabase-Projekts im Build statt der aus
# .env.local (Live). Laufzeit-Secrets einmalig: npx wrangler secret put <NAME> --env staging
set -euo pipefail
cd "$(dirname "$0")/.."
[[ -f .env.staging ]] || { echo ".env.staging fehlt (Vorlage: .env.staging.example)"; exit 1; }
set -a; source .env.staging; set +a
live_url=$(grep -E '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | cut -d= -f2- || true)
if [[ -n "$live_url" && "$NEXT_PUBLIC_SUPABASE_URL" == "$live_url" ]]; then
  echo ".env.staging zeigt auf die Live-Datenbank - Abbruch."; exit 1
fi
npx opennextjs-cloudflare build
npx opennextjs-cloudflare deploy --env staging
