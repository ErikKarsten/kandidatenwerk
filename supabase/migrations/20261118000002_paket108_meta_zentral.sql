-- Paket 108 (18.11.2026): Nur noch Kandidatenwerk fragt bei Meta an (Übernahme des
-- Meta-Analyse-Tools, Schritt 1). Vorher fragten Kandidatenwerk und das Tool dasselbe
-- Werbekonto getrennt ab - Fehler "User request limit reached" (Code 17) und 429.
--
-- meta_anzeigen_tag: Zahlen pro Anzeige und Tag, alle 30 Minuten für die letzten Tage
--   aktualisiert. Das Dashboard liest daraus statt bei jedem Aufruf Meta zu fragen.
--   Spalten wie zahlen_tag im Meta-Analyse-Tool (plus Namen), damit dessen Daten später
--   übernommen werden können.
-- meta_konto_status: letzter Stand der Konto-Prüfung (Kontostatus, Ausgabenlimit,
--   Einblendungen heute, Verlauf, Alarm) - eine Zeile pro Werbekonto.
-- Nur der Server (Service-Rolle) liest und schreibt; RLS an, keine Policies.

create table if not exists public.meta_anzeigen_tag (
  anzeige_id text not null,
  datum date not null,
  anzeige_name text,
  anzeigengruppe_id text,
  anzeigengruppe text,
  kampagne_id text,
  kampagne text,
  ausgaben numeric(12, 2) not null default 0,
  impressionen integer not null default 0,
  reichweite integer not null default 0,
  link_klicks integer not null default 0,
  leads integer not null default 0,
  aktualisiert_am timestamptz not null default now(),
  primary key (anzeige_id, datum)
);
create index if not exists meta_anzeigen_tag_datum_idx on public.meta_anzeigen_tag (datum);
create index if not exists meta_anzeigen_tag_kampagne_idx on public.meta_anzeigen_tag (kampagne_id, datum);
alter table public.meta_anzeigen_tag enable row level security;

create table if not exists public.meta_konto_status (
  konto_id text primary key,
  stand jsonb not null,
  geprueft_am timestamptz not null default now()
);
alter table public.meta_konto_status enable row level security;

NOTIFY pgrst, 'reload schema';
