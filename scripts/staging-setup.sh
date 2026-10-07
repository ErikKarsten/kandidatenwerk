#!/usr/bin/env bash
# Staging-Datenbank einrichten (T-99) - einmalig bzw. nach größeren Schemaänderungen.
#
# 1. Zieht das aktuelle Schema der LIVE-Datenbank (nur Struktur, keine Daten) nach
#    supabase/schema.sql - das Grundschema liegt sonst nirgends im Repo (Notfallplan).
# 2. Zieht die Konfiguration der Agentur (Agentur, Vorlagen, Sets, Felder, Textbausteine -
#    keine Personen, keine Kandidaten, keine Kunden) nach supabase/staging-config.sql.
# 3. Spielt beides in die Staging-Datenbank ein.
#
# Voraussetzungen: pg_dump und psql (z.B. Postgres.app), Version >= Server-Version (17).
# Verbindungen (Supabase > Project Settings > Database > Connection string, "Session pooler"):
#   LIVE_DB_URL=postgresql://postgres.<ref>:<passwort>@aws-...pooler.supabase.com:5432/postgres
#   STAGING_DB_URL=postgresql://postgres.<ref>:<passwort>@aws-...pooler.supabase.com:5432/postgres
# Aufruf: LIVE_DB_URL=... STAGING_DB_URL=... bash scripts/staging-setup.sh [--nur-dump]
set -euo pipefail
cd "$(dirname "$0")/.."

: "${LIVE_DB_URL:?LIVE_DB_URL fehlt}"
for tool in pg_dump psql; do command -v $tool >/dev/null || { echo "$tool fehlt (Postgres.app installieren)"; exit 1; }; done

CONFIG_TABLES=(agencies agency_settings automation_templates automation_template_sets automation_template_set_items
  custom_field_definitions field_templates profile_field_settings position_snippets)

echo "1/3 Schema der Live-Datenbank -> supabase/schema.sql"
pg_dump "$LIVE_DB_URL" --schema-only --schema=public --no-owner --no-privileges --quote-all-identifiers \
  > supabase/schema.sql
# Storage-Buckets und -Richtlinien gehören zum Schema der App (Dateien, Team-Fotos).
pg_dump "$LIVE_DB_URL" --data-only --table=storage.buckets --no-owner --inserts > supabase/storage-buckets.sql
psql "$LIVE_DB_URL" -At -c "select format('create policy %I on storage.objects as %s for %s to %s%s%s;',
    policyname, permissive, cmd, array_to_string(roles, ', '),
    coalesce(' using (' || qual || ')', ''), coalesce(' with check (' || with_check || ')', ''))
  from pg_policies where schemaname = 'storage' and tablename = 'objects' order by policyname" \
  > supabase/storage-policies.sql

echo "2/3 Konfiguration (ohne Personen) -> supabase/staging-config.sql"
args=(); for t in "${CONFIG_TABLES[@]}"; do args+=(--table="public.$t"); done
pg_dump "$LIVE_DB_URL" --data-only --no-owner --inserts --disable-triggers "${args[@]}" > supabase/staging-config.sql

if [[ "${1:-}" == "--nur-dump" ]]; then echo "Nur Abzug erstellt."; exit 0; fi
: "${STAGING_DB_URL:?STAGING_DB_URL fehlt}"
if [[ "$STAGING_DB_URL" == "$LIVE_DB_URL" ]]; then echo "STAGING_DB_URL zeigt auf Live - Abbruch."; exit 1; fi

echo "3/3 In Staging einspielen"
psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -q -f supabase/schema.sql
psql "$STAGING_DB_URL" -q -f supabase/storage-buckets.sql
psql "$STAGING_DB_URL" -q -f supabase/storage-policies.sql
psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -q -c "set session_replication_role = replica;" -f supabase/staging-config.sql
echo "Fertig. Jetzt: npx tsx scripts/staging-seed.ts (Admin-Login und Testdaten)."
