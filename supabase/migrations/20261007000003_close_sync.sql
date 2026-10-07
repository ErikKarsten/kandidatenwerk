-- Paket 30 (07.10.2026), T-127: Close-Anbindung ohne Zapier.
-- 1. Alle Close-Aktivitäten eines Kunden (Besprechungen, Telefonate, Notizen, eigene
--    Aktivitäten, Statuswechsel) laufen über dieselbe Warteschlange wie bisher die
--    Besprechungen und landen als Kommentar im Projekt. Telefonate werden transkribiert.
alter table public.close_meeting_summaries
  add column if not exists activity_type text not null default 'meeting',
  add column if not exists activity_at timestamptz,
  add column if not exists call_duration integer,
  add column if not exists transcript text;
alter table public.close_meeting_summaries alter column raw_summary drop not null;
alter table public.close_meeting_summaries drop constraint if exists close_meeting_summaries_activity_type_check;
alter table public.close_meeting_summaries add constraint close_meeting_summaries_activity_type_check
  check (activity_type in ('meeting', 'call', 'note', 'custom', 'status'));
create index if not exists close_meeting_summaries_lead_idx on public.close_meeting_summaries (lead_id);
-- "in_arbeit": vom Cronjob gesperrt (Transkription dauert), damit ein überlappender Lauf
-- dieselbe Aktivität nicht doppelt verarbeitet. Hängt sie länger als 20 Minuten, gilt sie wieder als offen.
alter table public.close_meeting_summaries add column if not exists locked_at timestamptz;
alter table public.close_meeting_summaries drop constraint if exists close_meeting_summaries_status_check;
alter table public.close_meeting_summaries add constraint close_meeting_summaries_status_check
  check (status in ('offen', 'in_arbeit', 'erledigt', 'fehler'));

-- 2. Übernahme eines Kunden aus Close, ausgelöst durch den Lead-Status "Gewonnen" oder
--    "Folgebesprechung zum SC vereinbart (Angebot verschickt)": Kunde anlegen, alle
--    Aktivitäten holen und verarbeiten, danach Kanzleiprofil und Stellen per KI befüllen.
create table if not exists public.close_onboarding (
  lead_id text primary key,
  client_id uuid references public.clients(id) on delete cascade,
  trigger_status text,
  status text not null default 'offen' check (status in ('offen', 'aktivitaeten', 'profil', 'erledigt', 'fehler')),
  attempts integer not null default 0,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.close_onboarding enable row level security;
grant select, insert, update, delete on public.close_onboarding to service_role;
