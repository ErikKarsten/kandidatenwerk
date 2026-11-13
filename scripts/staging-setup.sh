#!/usr/bin/env bash
# Staging-Datenbank einrichten (T-99, Paket 102) - einmalig bzw. nach größeren Schemaänderungen.
#
# 1. Zieht das aktuelle Schema der LIVE-Datenbank (nur Struktur, keine Daten) nach
#    supabase/schema.sql - das Grundschema liegt sonst nirgends im Repo (Notfallplan).
# 2. Zieht die Konfiguration der Agentur (Agentur, Vorlagen, Sets, Felder, Textbausteine,
#    Berufsbilder, Regionen - keine Personen, keine Kandidaten, keine Kunden) nach
#    supabase/staging-config.sql.
# 3. Spielt beides in die Staging-Datenbank ein. Das Schema in EINER Transaktion: Schlägt
#    etwas fehl, bleibt Staging leer und das Skript kann nach der Korrektur neu laufen.
#
# Liest von Live nur (pg_dump/psql-Abfragen), schreibt ausschließlich in STAGING_DB_URL.
# Voraussetzungen: Postgres.app (pg_dump/psql werden dort automatisch gefunden).
# Verbindungen (Supabase > Connect > Session pooler), Passwort jeweils einsetzen:
#   LIVE_DB_URL=postgresql://postgres.<ref>:<passwort>@aws-...pooler.supabase.com:5432/postgres
#   STAGING_DB_URL=postgresql://postgres.<ref>:<passwort>@aws-...pooler.supabase.com:5432/postgres
# Aufruf: bash scripts/staging-setup.sh [--nur-dump | --fortsetzen]   (fragt die Verbindungen ab)
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="/Applications/Postgres.app/Contents/Versions/latest/bin:$PATH"

for tool in pg_dump psql; do command -v $tool >/dev/null || { echo "$tool fehlt (Postgres.app installieren)"; exit 1; }; done
# Ohne Angabe fragt das Skript nach Adresse (so wie aus Supabase kopiert, mit [YOUR-PASSWORD])
# und Passwort getrennt. Das Passwort wird verdeckt abgefragt und für die Adresse kodiert -
# Sonderzeichen wie @ / # ? : sind so kein Problem (Paket 102).
ref_from_env() { grep -E '^NEXT_PUBLIC_SUPABASE_URL=' "$1" | sed -E 's#.*https://([a-z0-9]+)\.supabase\.co.*#\1#'; }
ask_db_url() { # $1 = LIVE/STAGING, $2 = erwartete Projekt-ID
  local tpl pw
  echo "Verbindung $1: Supabase > Connect > Direct > Session pooler (Adresse beginnt mit postgresql://postgres.$2:)" >&2
  read -rp "  Adresse $1 (so wie kopiert, mit [YOUR-PASSWORD]): " tpl
  read -rsp "  Datenbank-Passwort $1 (bleibt unsichtbar): " pw; echo >&2
  pw=$(python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$pw")
  printf '%s' "${tpl//\[YOUR-PASSWORD\]/$pw}"
}
check_db_url() { # $1 = LIVE/STAGING, $2 = Adresse, $3 = erwartete Projekt-ID
  [[ "$2" =~ ^postgres(ql)?://postgres\.([a-z0-9]+):[^@]+@[^/]+pooler\.supabase\.com:5432/postgres$ ]] || {
    echo "Adresse $1 hat nicht das Format des Session poolers (postgresql://postgres.<projekt>:<passwort>@...pooler.supabase.com:5432/postgres) - Abbruch."; exit 1; }
  [[ "${BASH_REMATCH[2]}" == "$3" ]] || { echo "Adresse $1 gehört zum falschen Supabase-Projekt (erwartet: $3) - Abbruch."; exit 1; }
}
live_ref=$(ref_from_env .env.local)
staging_ref=$(ref_from_env .env.staging)
if [[ -z "${LIVE_DB_URL:-}" ]]; then LIVE_DB_URL=$(ask_db_url LIVE "$live_ref"); fi
check_db_url LIVE "$LIVE_DB_URL" "$live_ref"
if [[ "${1:-}" != "--nur-dump" ]]; then
  if [[ -z "${STAGING_DB_URL:-}" ]]; then STAGING_DB_URL=$(ask_db_url STAGING "$staging_ref"); fi
  check_db_url STAGING "$STAGING_DB_URL" "$staging_ref"
  psql "$STAGING_DB_URL" -At -c "select 1" >/dev/null || { echo "Anmeldung an Staging fehlgeschlagen (Passwort?) - Abbruch."; exit 1; }
fi
psql "$LIVE_DB_URL" -At -c "select 1" >/dev/null || { echo "Anmeldung an Live fehlgeschlagen (Passwort?) - Abbruch."; exit 1; }

CONFIG_TABLES=(agencies agency_settings automation_templates automation_template_sets automation_template_set_items
  custom_field_definitions field_templates profile_field_settings position_snippets berufsbilder email_templates locations)

echo "1/4 Erweiterungen und Schema der Live-Datenbank -> supabase/schema.sql"
psql "$LIVE_DB_URL" -At -c "select format('create extension if not exists %I with schema %I;', e.extname, n.nspname)
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname <> 'plpgsql' order by 1" \
  > supabase/extensions.sql
pg_dump "$LIVE_DB_URL" --schema-only --schema=public --no-owner --quote-all-identifiers \
  | grep -vE '^(CREATE SCHEMA "public";|COMMENT ON SCHEMA "public" IS|ALTER DEFAULT PRIVILEGES )' > supabase/schema.sql
# (Schema "public" und seine Standardrechte bringt jedes Supabase-Projekt schon mit; die
#  Standardrechte für supabase_admin dürfte der Nutzer postgres ohnehin nicht setzen.)
# Storage-Buckets und -Richtlinien gehören zum Schema der App (Dateien, Team-Fotos).
pg_dump "$LIVE_DB_URL" --data-only --table=storage.buckets --no-owner --inserts > supabase/storage-buckets.sql
# Leerer Suchpfad: Tabellen und Funktionen in den Regeln werden voll ausgeschrieben
# (public.client_assignments), sonst findet Staging sie beim Einspielen nicht. Jede Regel
# auf einer Zeile, damit --fortsetzen vorhandene Regeln zeilenweise überspringen kann.
psql "$LIVE_DB_URL" -qAt -c "set search_path = ''" -c "select format('create policy %I on storage.objects as %s for %s to %s%s%s;',
    policyname, permissive, cmd, array_to_string(roles, ', '),
    coalesce(' using (' || replace(qual, E'\\n', ' ') || ')', ''),
    coalesce(' with check (' || replace(with_check, E'\\n', ' ') || ')', ''))
  from pg_policies where schemaname = 'storage' and tablename = 'objects' order by policyname" \
  > supabase/storage-policies.sql

echo "2/4 Konfiguration (ohne Personen) -> supabase/staging-config.sql"
args=(); for t in "${CONFIG_TABLES[@]}"; do args+=(--table="public.$t"); done
# Ohne --disable-triggers: das bräuchte Superuser-Rechte. Fremdschlüssel und Trigger schaltet
# beim Einspielen session_replication_role = replica ab (in Supabase erlaubt).
pg_dump "$LIVE_DB_URL" --data-only --no-owner --inserts "${args[@]}" > supabase/staging-config.sql

if [[ "${1:-}" == "--nur-dump" ]]; then echo "Nur Abzug erstellt."; exit 0; fi
: "${STAGING_DB_URL:?STAGING_DB_URL fehlt}"
if [[ "$STAGING_DB_URL" == "$LIVE_DB_URL" ]]; then echo "STAGING_DB_URL zeigt auf Live - Abbruch."; exit 1; fi
live_ref=$(sed -E 's#^postgres(ql)?://postgres\.([^:]+):.*#\2#' <<<"$LIVE_DB_URL")
staging_ref=$(sed -E 's#^postgres(ql)?://postgres\.([^:]+):.*#\2#' <<<"$STAGING_DB_URL")
if [[ "$live_ref" == "$staging_ref" ]]; then echo "STAGING_DB_URL gehört zum Live-Projekt - Abbruch."; exit 1; fi
# --fortsetzen: Schema steht schon (z. B. nach einem Abbruch bei Speicher oder Konfiguration).
schema_da=$(psql "$STAGING_DB_URL" -At -c "select to_regclass('public.candidates') is not null")
if [[ "$schema_da" == "t" && "${1:-}" != "--fortsetzen" ]]; then
  echo "Staging hat schon Tabellen. Fortsetzen ohne erneutes Schema: bash scripts/staging-setup.sh --fortsetzen"
  echo "Für einen Neuaufbau das Staging-Projekt zurücksetzen (Supabase > Database > Reset) - Abbruch."
  exit 1
fi

echo "3/4 Erweiterungen, Schema und Dateispeicher in Staging einspielen"
if [[ "$schema_da" == "t" ]]; then echo "   Schema steht schon - übersprungen."; else
psql "$STAGING_DB_URL" -q -f supabase/extensions.sql || echo "Hinweis: nicht jede Erweiterung ließ sich anlegen (siehe oben)."
psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -q --single-transaction -f supabase/schema.sql
fi
# Eigene Aufrufe: pg_dump-Dateien setzen den Suchpfad für die ganze Verbindung auf leer.
if [[ "$(psql "$STAGING_DB_URL" -At -c "select count(*) from storage.buckets")" == "0" ]]; then
  psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -q --single-transaction -f supabase/storage-buckets.sql
fi
regeln=$(mktemp)
psql "$STAGING_DB_URL" -At -c "select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects'" > "$regeln"
grep -v -F -f <(sed -e 's/.*/create policy "&" on /p' -e 's/.*/create policy & on /' "$regeln"; echo "§kein-treffer§") supabase/storage-policies.sql \
  | psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -q --single-transaction
rm -f "$regeln"

echo "4/4 Konfiguration in Staging einspielen"
if [[ "$(psql "$STAGING_DB_URL" -At -c "select count(*) from public.agencies")" != "0" ]]; then
  echo "   Konfiguration ist schon da - übersprungen."
else
  psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -q --single-transaction -c "set session_replication_role = replica;" -f supabase/staging-config.sql
fi
psql "$STAGING_DB_URL" -q -c "NOTIFY pgrst, 'reload schema';"
echo "Fertig. Jetzt: npx tsx scripts/staging-seed.ts (Admin-Login und Testdaten)."
