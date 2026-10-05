-- Paket 14 (05.10.2026)
--
-- 1. Fehlermeldungen vom System (T-67): fehlgeschlagene Cronjobs laufen bei den
--    Fehlermeldungen auf. source unterscheidet Nutzer-Meldungen von System-Einträgen,
--    source_key fasst gleiche Fehler zusammen (z.B. "cron:meta-leads-sync"), solange
--    der Eintrag offen ist (occurrences/last_seen_at statt neuer Einträge).
alter table public.bug_reports
  add column if not exists source text not null default 'nutzer' check (source in ('nutzer', 'system')),
  add column if not exists source_key text,
  add column if not exists occurrences integer not null default 1,
  add column if not exists last_seen_at timestamptz;

create index if not exists bug_reports_source_key_idx on public.bug_reports (source_key) where source_key is not null;

-- 2. Dublettenfälle (T-66): eigene Sektion bei den Fehlermeldungen. Ein Fall merkt sich
--    die betroffenen Datensätze (signature = Art + sortierte IDs), damit ein ignorierter
--    Fall bei der nächsten Prüfung nicht wieder auftaucht.
create table public.duplicate_cases (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid references public.agencies(id) on delete cascade,
  kind text not null check (kind in ('kunde', 'kandidat')),
  record_ids uuid[] not null,
  reason text not null,
  signature text not null unique,
  status text not null default 'offen' check (status in ('offen', 'ignoriert', 'zusammengefuehrt', 'geloescht')),
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index duplicate_cases_status_idx on public.duplicate_cases (status, created_at desc);

alter table public.duplicate_cases enable row level security;

create policy "Team liest Dublettenfälle"
on public.duplicate_cases for select to authenticated
using (public.current_user_is_staff() and (agency_id is null or agency_id = public.current_user_agency_id()));

create policy "Team bearbeitet Dublettenfälle"
on public.duplicate_cases for update to authenticated
using (public.current_user_is_staff() and (agency_id is null or agency_id = public.current_user_agency_id()))
with check (public.current_user_is_staff() and (agency_id is null or agency_id = public.current_user_agency_id()));

grant select, update on public.duplicate_cases to authenticated;
grant select, insert, update, delete on public.duplicate_cases to service_role;

notify pgrst, 'reload schema';

-- 3. Beispiel-Lead (T-68): Demo-Kandidat je neuem Kunden zum Vorführen. is_demo hält
--    ihn aus Listen, Statistiken, Matching und Dublettenprüfung heraus.
alter table public.candidates
  add column if not exists is_demo boolean not null default false;

create index if not exists candidates_is_demo_idx on public.candidates (is_demo) where is_demo;

notify pgrst, 'reload schema';
