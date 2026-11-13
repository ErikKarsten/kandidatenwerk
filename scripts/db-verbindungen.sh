#!/usr/bin/env bash
# Datenbank-Verbindungen in .env.db eintragen (Paket 104) - fragt Adresse und Passwort je
# Umgebung im Terminal ab, prüft Format, Projekt und Anmeldung und schreibt dann .env.db.
# Aufruf: bash scripts/db-verbindungen.sh
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="/Applications/Postgres.app/Contents/Versions/latest/bin:$PATH"
command -v psql >/dev/null || { echo "psql fehlt (Postgres.app installieren)"; exit 1; }

ref_from_env() { grep -E '^NEXT_PUBLIC_SUPABASE_URL=' "$1" | sed -E 's#.*https://([a-z0-9]+)\.supabase\.co.*#\1#'; }

ask() { # $1 = LIVE/STAGING, $2 = erwartete Projekt-ID -> gibt die geprüfte Adresse aus
  local tpl pw url
  while true; do
    echo "Verbindung $1: Supabase > Connect > Direct > Session pooler (beginnt mit postgresql://postgres.$2:)" >&2
    read -rp "  Adresse $1 (so wie kopiert; Passwort darf schon drinstehen): " tpl
    if [[ "$tpl" == *"[YOUR-PASSWORD]"* ]]; then
      read -rsp "  Datenbank-Passwort $1 (bleibt unsichtbar): " pw; echo >&2
      pw=$(python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$pw")
      url="${tpl//\[YOUR-PASSWORD\]/$pw}"
    else
      url="$tpl"
    fi
    if [[ ! "$url" =~ ^postgres(ql)?://postgres\.([a-z0-9]+):[^@]+@[^/]+pooler\.supabase\.com:5432/postgres$ ]]; then
      echo "  -> Das ist keine Session-pooler-Adresse. Bitte noch einmal." >&2; continue
    fi
    if [[ "${BASH_REMATCH[2]}" != "$2" ]]; then
      echo "  -> Die Adresse gehört zu einem anderen Projekt (erwartet $2). Bitte noch einmal." >&2; continue
    fi
    if ! psql "$url" -X -At -c "select 1" >/dev/null 2>&1; then
      echo "  -> Anmeldung fehlgeschlagen (Passwort?). Bitte noch einmal." >&2; continue
    fi
    echo "  -> $1 ok." >&2
    printf '%s' "$url"
    return
  done
}

staging=$(ask STAGING "$(ref_from_env .env.staging)")
live=$(ask LIVE "$(ref_from_env .env.local)")
umask 077
{
  sed -n '1,/^STAGING_DB_URL=/p' .env.db.example | sed '$d'
  echo "STAGING_DB_URL=$staging"
  echo "LIVE_DB_URL=$live"
} > .env.db
chmod 600 .env.db
echo "Gespeichert in .env.db (nur für dich lesbar)."
