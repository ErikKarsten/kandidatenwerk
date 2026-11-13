#!/usr/bin/env bash
# SQL auf Staging oder Live ausführen (Paket 104) - ohne Supabase-SQL-Editor.
#
#   bash scripts/sql.sh staging supabase/migrations/<datei>.sql   Migration auf Staging einspielen
#   bash scripts/sql.sh live    supabase/migrations/<datei>.sql   Migration auf Live einspielen
#   bash scripts/sql.sh <ziel> status                             noch nicht eingespielte Migrationen
#   bash scripts/sql.sh <ziel> -c "select ..."                    Abfrage (auf Live nur lesend)
#   bash scripts/sql.sh <ziel> baseline                           einmalig: alle vorhandenen Migrationen
#                                                                 als eingespielt vermerken
#
# Absprache mit dem Nutzer (13.11.2026), hier technisch erzwungen: Auf Live laufen nur
# Migrationen, die genau so in origin/main liegen - der Merge auf GitHub ist die Freigabe.
# Abfragen auf Live laufen in einer nur-lesenden Sitzung.
#
# Jede Migration läuft in EINER Transaktion und wird mit Prüfsumme in kw_meta.migrationen
# vermerkt: doppelt einspielen geht nicht, eine später veränderte Datei fällt auf.
# Ausnahme für Befehle, die keine Transaktion vertragen (z. B. create index concurrently):
# --ohne-transaktion hinter dem Dateinamen.
#
# Verbindungen stehen in .env.db (STAGING_DB_URL, LIVE_DB_URL; Supabase > Connect > Direct >
# Session pooler). Bewusst nicht in .env.local - die packt OpenNext beim Bauen in den Worker.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="/Applications/Postgres.app/Contents/Versions/latest/bin:$PATH"

usage() { sed -n '4,9p' "$0" | sed 's/^# \{0,1\}//'; exit 2; }
fail() { echo "ABBRUCH: $*" >&2; exit 1; }

ziel="${1:-}"; aktion="${2:-}"
case "$ziel" in
  staging) var=STAGING_DB_URL; envfile=.env.staging ;;
  live) var=LIVE_DB_URL; envfile=.env.local ;;
  *) usage ;;
esac
[[ -n "$aktion" ]] || usage
command -v psql >/dev/null || fail "psql fehlt (Postgres.app installieren)"
[[ -f .env.db ]] || fail ".env.db fehlt (Vorlage: .env.db.example)"
[[ -f "$envfile" ]] || fail "$envfile fehlt"

url=$(grep -E "^$var=" .env.db | tail -1 | cut -d= -f2- | sed -E 's/^"(.*)"$/\1/' || true)
[[ -n "$url" ]] || fail "$var fehlt in .env.db"
# Gehört die Verbindung wirklich zum Projekt dieser Umgebung? (Schutz vor vertauschten Adressen)
erwartet=$(grep -E '^NEXT_PUBLIC_SUPABASE_URL=' "$envfile" | sed -E 's#.*https://([a-z0-9]+)\.supabase\.co.*#\1#')
ref=$(sed -E 's#^postgres(ql)?://postgres\.([a-z0-9]+):.*#\2#' <<<"$url")
[[ -n "$erwartet" && "$ref" == "$erwartet" ]] || fail "$var gehört nicht zum $ziel-Projekt (erwartet $erwartet)."

PSQL=(psql "$url" -X -v ON_ERROR_STOP=1 -q)

ensure_meta() {
  "${PSQL[@]}" -c "set client_min_messages = warning; create schema if not exists kw_meta;
    revoke all on schema kw_meta from public, anon, authenticated;
    create table if not exists kw_meta.migrationen (
      datei text primary key,
      pruefsumme text not null,
      eingespielt_am timestamptz not null default now()
    );" >/dev/null
}

checksum() { shasum -a 256 "$1" | cut -c1-64; }
sql_text() { local q="'"; printf "'%s'" "${1//$q/$q$q}"; }

case "$aktion" in
  -c)
    abfrage="${3:-}"; [[ -n "$abfrage" ]] || usage
    if [[ "$ziel" == "live" ]]; then
      "${PSQL[@]}" -c "set default_transaction_read_only = on" -c "$abfrage"
    else
      "${PSQL[@]}" -c "$abfrage"
    fi
    ;;

  status)
    ensure_meta
    eingespielt=$("${PSQL[@]}" -At -c "select datei from kw_meta.migrationen")
    offen=0
    for f in supabase/migrations/*.sql; do
      grep -qxF "$(basename "$f")" <<<"$eingespielt" || { echo "offen: $f"; offen=$((offen + 1)); }
    done
    echo "$ziel: $(grep -c . <<<"$eingespielt" || true) eingespielt, $offen offen."
    ;;

  baseline)
    # Nur einmalig: alles, was es bisher gibt, wurde früher von Hand eingespielt.
    ensure_meta
    [[ "$("${PSQL[@]}" -At -c "select count(*) from kw_meta.migrationen")" == "0" ]] || fail "Baseline gibt es schon."
    werte=""
    for f in supabase/migrations/*.sql; do
      werte+="${werte:+,}($(sql_text "$(basename "$f")"), '$(checksum "$f")')"
    done
    "${PSQL[@]}" -c "insert into kw_meta.migrationen (datei, pruefsumme) values $werte"
    echo "$ziel: $(ls supabase/migrations/*.sql | wc -l | tr -d ' ') Migrationen als eingespielt vermerkt."
    ;;

  *)
    datei="$aktion"
    [[ -f "$datei" && "$datei" == supabase/migrations/*.sql ]] || fail "Erwartet eine Datei unter supabase/migrations/: $datei"
    name=$(basename "$datei")
    if [[ "$ziel" == "live" ]]; then
      git fetch -q origin main
      git cat-file -e "origin/main:$datei" 2>/dev/null || fail "$name ist noch nicht in main gemergt - auf Live erst nach dem Merge."
      [[ "$(git show "origin/main:$datei" | shasum -a 256 | cut -c1-64)" == "$(checksum "$datei")" ]] \
        || fail "$name weicht lokal von main ab - auf Live läuft nur der gemergte Stand."
    fi
    ensure_meta
    summe=$(checksum "$datei")
    vorhanden=$("${PSQL[@]}" -At -c "select pruefsumme from kw_meta.migrationen where datei = $(sql_text "$name")")
    if [[ -n "$vorhanden" ]]; then
      [[ "$vorhanden" == "$summe" ]] && { echo "$ziel: $name ist schon eingespielt."; exit 0; }
      fail "$name wurde auf $ziel mit anderem Inhalt eingespielt - Änderungen als neue Migration anlegen."
    fi
    vermerk="insert into kw_meta.migrationen (datei, pruefsumme) values ($(sql_text "$name"), '$summe')"
    if [[ "${3:-}" == "--ohne-transaktion" ]]; then
      "${PSQL[@]}" -f "$datei"
      "${PSQL[@]}" -c "$vermerk"
    else
      "${PSQL[@]}" --single-transaction -f "$datei" -c "$vermerk"
    fi
    echo "$ziel: $name eingespielt."
    ;;
esac
