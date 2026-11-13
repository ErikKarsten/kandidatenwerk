#!/usr/bin/env bash
# Staging bauen und deployen (T-99, Paket 102): Worker kandidatenwerk-staging auf workers.dev.
#
# Wichtig: OpenNext packt beim Bauen ALLE .env-Dateien in den Worker (.open-next/cloudflare/
# next-env.mjs). Läge .env.local (Live) dabei im Projekt, hätte Staging die Live-Schlüssel für
# Meta, Close, Leadtable, Kanzleistelle24, Brevo und die Live-Datenbank. Deshalb:
#   1. .env.local wird während des Bauens zur Seite gelegt und danach immer zurückgeholt.
#   2. Die Werte aus .env.staging kommen als .env.production.local in den Build.
#   3. Vor dem Hochladen prüft scripts/staging-build-check.mjs, dass kein Live-Wert im
#      gebauten Worker steckt (außer bewusst gleichen, z. B. Brevo) - sonst Abbruch.
# Laufzeit-Secret einmalig: npx wrangler secret put CRON_SECRET --env staging
set -euo pipefail
cd "$(dirname "$0")/.."

[[ -f .env.staging ]] || { echo ".env.staging fehlt (Vorlage: .env.staging.example)"; exit 1; }
[[ -f .env.local ]] || { echo ".env.local fehlt - wird für die Sicherheitsprüfung gebraucht."; exit 1; }
for f in .env .env.production .env.production.local .env.local.live-beiseite; do
  [[ -e "$f" ]] && { echo "$f existiert - würde in den Staging-Worker gelangen. Bitte prüfen und entfernen."; exit 1; }
done

value_of() { grep -E "^$1=" "$2" | tail -1 | cut -d= -f2- | sed -E 's/^"(.*)"$/\1/' || true; }
staging_url=$(value_of NEXT_PUBLIC_SUPABASE_URL .env.staging)
live_url=$(value_of NEXT_PUBLIC_SUPABASE_URL .env.local)
[[ -n "$staging_url" ]] || { echo "NEXT_PUBLIC_SUPABASE_URL fehlt in .env.staging"; exit 1; }
[[ "$staging_url" != "$live_url" ]] || { echo ".env.staging zeigt auf die Live-Datenbank - Abbruch."; exit 1; }

restore() {
  rm -f .env.production.local
  if [[ -f .env.local.live-beiseite ]]; then mv .env.local.live-beiseite .env.local; fi
}
trap restore EXIT
trap 'exit 130' INT TERM
mv .env.local .env.local.live-beiseite
# Nur App-Werte in den Worker, keine Logins und Datenbank-Passwörter aus .env.staging.
grep -vE '^(STAGING_ADMIN_|LIVE_DB_URL|STAGING_DB_URL)' .env.staging > .env.production.local

npx opennextjs-cloudflare build
node scripts/staging-build-check.mjs .env.local.live-beiseite .env.staging .open-next
npx opennextjs-cloudflare deploy --env staging
