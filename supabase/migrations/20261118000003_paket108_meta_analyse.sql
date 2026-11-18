-- Paket 108, Teil 2 (18.11.2026): Meta-Analyse-Tool als eigener Bereich in Kandidatenwerk.
-- Tabellen wie im Meta-Analyse-Tool (supabase/01_datenbank.sql dort), damit die Auswertung
-- gleich bleibt. Nur der Server (Service-Rolle) liest und schreibt; RLS an, keine Policies.
--
-- meta_anzeigen: Texte, Einstellungen und Bild je Anzeige (täglich aktualisiert).
--   motiv_typ: von Hand gesetzt (oder aus dem Testlauf übernommen), sonst erkennt
--   Kandidatenwerk den Motiv-Typ aus dem Anzeigennamen (src/lib/meta-analyse.ts).
-- meta_einschaetzungen: Bewertung von Bild, Text und Benefits durch die KI - Vermutungen,
--   keine Messwerte.
-- Speicher "meta-motive" (privat): Anzeigenbilder bzw. Video-Vorschaubilder.

create table if not exists public.meta_anzeigen (
  id text primary key,
  name text not null,
  kampagne_id text,
  kampagne text,
  anzeigengruppe_id text,
  anzeigengruppe text,
  status text,
  erstellt_am timestamptz,
  format text,
  ueberschriften text[] not null default '{}',
  texte text[] not null default '{}',
  button text,
  lead_formular_id text,
  zielgruppe text,
  budget text,
  bild_pfad text,
  motiv_typ text,
  aktualisiert_am timestamptz not null default now()
);
alter table public.meta_anzeigen enable row level security;

create table if not exists public.meta_einschaetzungen (
  anzeige_id text primary key,
  bild_urteil text check (bild_urteil in ('stark', 'mittel', 'schwach', 'unklar')),
  bild text,
  text_urteil text check (text_urteil in ('stark', 'mittel', 'schwach', 'unklar')),
  text text,
  benefits_urteil text check (benefits_urteil in ('stark', 'mittel', 'schwach', 'unklar')),
  benefits text,
  fazit text,
  modell text,
  erstellt_am timestamptz not null default now()
);
alter table public.meta_einschaetzungen enable row level security;

alter table public.meta_anzeigen_tag add column if not exists videoaufrufe_3s integer not null default 0;
alter table public.meta_anzeigen_tag add column if not exists thruplays integer not null default 0;

-- Zwischenstand von Teil 1 (nur Staging): Summen je Kampagne braucht das Dashboard nicht mehr.
drop function if exists public.meta_kampagnen_summen(date, date);
-- Benachrichtigungen aufs Gerät gibt es nicht (wie im Meta-Analyse-Tool seit 18.11.).
drop table if exists public.push_abos;

-- Summen je Anzeige im Zeitraum für die Auswertung. Reichweite ist pro Tag und lässt sich
-- über Tage nicht addieren - deshalb nicht dabei.
create or replace function public.meta_anzeigen_summen(von date, bis date)
returns table (
  anzeige_id text, anzeige_name text, kampagne_id text, kampagne text,
  ausgaben numeric, impressionen bigint, klicks bigint, leads bigint,
  videoaufrufe_3s bigint, thruplays bigint, erster_tag date, letzter_tag date
)
language sql stable
set search_path = public
as $$
  select t.anzeige_id, max(t.anzeige_name), max(t.kampagne_id), max(t.kampagne),
         sum(t.ausgaben), sum(t.impressionen), sum(t.link_klicks), sum(t.leads),
         sum(t.videoaufrufe_3s), sum(t.thruplays), min(t.datum), max(t.datum)
  from public.meta_anzeigen_tag t
  where t.datum between von and bis
  group by t.anzeige_id
$$;
revoke all on function public.meta_anzeigen_summen(date, date) from public, anon, authenticated;
grant execute on function public.meta_anzeigen_summen(date, date) to service_role;

insert into storage.buckets (id, name, public)
values ('meta-motive', 'meta-motive', false)
on conflict (id) do nothing;

NOTIFY pgrst, 'reload schema';
