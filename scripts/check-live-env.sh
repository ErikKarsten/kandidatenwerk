#!/usr/bin/env bash
# Schutz vor dem Live-Deploy (Paket 102): bricht ab, wenn die Umgebungsdateien nicht zum
# Live-Stand passen - z. B. nach einem abgebrochenen Staging-Deploy.
set -euo pipefail
cd "$(dirname "$0")/.."

[[ -f .env.local ]] || { echo ".env.local fehlt (liegt sie noch als .env.local.live-beiseite da?) - Abbruch."; exit 1; }
for f in .env .env.production .env.production.local .env.local.live-beiseite; do
  [[ -e "$f" ]] && { echo "$f existiert - würde in den Live-Worker gelangen. Bitte prüfen und entfernen."; exit 1; }
done
if [[ -f .env.staging ]]; then
  staging_url=$(grep -E '^NEXT_PUBLIC_SUPABASE_URL=' .env.staging | cut -d= -f2- || true)
  live_url=$(grep -E '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | cut -d= -f2- || true)
  if [[ -n "$staging_url" && "$staging_url" == "$live_url" ]]; then
    echo ".env.local zeigt auf die Staging-Datenbank - Abbruch."; exit 1
  fi
fi
if grep -qE '^APP_ENV=staging' .env.local; then echo ".env.local enthält APP_ENV=staging - Abbruch."; exit 1; fi
echo "Live-Konfiguration ok."
