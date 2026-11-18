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
-- push_abos: Geräte, die den Kampagnen-Alarm als Browser-Benachrichtigung bekommen.
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

create table if not exists public.push_abos (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  geraet text,
  created_at timestamptz not null default now()
);
create index if not exists push_abos_profile_idx on public.push_abos (profile_id);
alter table public.push_abos enable row level security;

-- Summen je Kampagne für das Dashboard (statt bei jedem Aufruf Meta zu fragen).
create or replace function public.meta_kampagnen_summen(von date, bis date)
returns table (kampagne_id text, kampagne text, ausgaben numeric, leads bigint)
language sql stable
set search_path = public
as $$
  select t.kampagne_id, max(t.kampagne), sum(t.ausgaben), sum(t.leads)
  from public.meta_anzeigen_tag t
  where t.datum between von and bis and t.kampagne_id is not null
  group by t.kampagne_id
$$;
revoke all on function public.meta_kampagnen_summen(date, date) from public, anon, authenticated;
grant execute on function public.meta_kampagnen_summen(date, date) to service_role;

NOTIFY pgrst, 'reload schema';
