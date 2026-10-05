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

-- Demo-Kandidaten zählen nirgends mit: nicht in "Alle Kandidaten", nicht in den
-- Kandidatenzahlen der Kundenliste, nicht bei "weitergeleitet".
create or replace view public.candidate_list_rows
with (security_invoker = true)
as
select
  cand.id,
  cand.first_name,
  cand.last_name,
  (cand.first_name || ' ' || cand.last_name) as full_name,
  cand.email,
  cand.status,
  cand.berufsbild,
  cand.source,
  cand.created_at,
  cand.custom_fields,
  cand.campaign_id,
  camp.title as campaign_title,
  camp.client_id,
  cl.name as client_name
from public.candidates cand
left join public.campaigns camp on camp.id = cand.campaign_id
left join public.clients cl on cl.id = camp.client_id
where not cand.is_demo;

create or replace view public.client_list_stats
with (security_invoker = true)
as
with campaign_counts as (
  select client_id, count(*) as campaign_count
  from public.campaigns
  group by client_id
),
candidate_status_counts as (
  select ca.client_id, cand.status, count(distinct cand.id) as cnt
  from public.client_assignments ca
  join public.candidates cand on cand.id = ca.candidate_id
  where ca.removed_at is null and not cand.is_demo
  group by ca.client_id, cand.status
),
candidate_totals as (
  select
    client_id,
    sum(cnt) as candidate_count,
    sum(cnt) filter (where status = 'platziert') as placement_count,
    jsonb_agg(jsonb_build_object('status', status, 'count', cnt)) as pipeline
  from candidate_status_counts
  group by client_id
)
select
  c.id,
  c.name,
  c.contact_name,
  c.contact_email,
  c.active,
  c.status,
  c.logo_url,
  c.created_at,
  coalesce(cc.campaign_count, 0)::integer as campaign_count,
  coalesce(ct.candidate_count, 0)::integer as candidate_count,
  coalesce(ct.placement_count, 0)::integer as placement_count,
  coalesce(ct.pipeline, '[]'::jsonb) as pipeline,
  c.project_phase,
  c.key_account_manager_id,
  (cp.finalized_at is not null) as profile_finalized
from public.clients c
left join campaign_counts cc on cc.client_id = c.id
left join candidate_totals ct on ct.client_id = c.id
left join public.client_profiles cp on cp.client_id = c.id;


create or replace function public.count_distinct_forwarded_candidates(p_client_id uuid default null)
returns integer
language sql
stable
security invoker
set search_path = public
as $$
  select count(distinct ca.candidate_id)::integer
  from client_assignments ca
  join candidates cand on cand.id = ca.candidate_id
  where (p_client_id is null or ca.client_id = p_client_id)
    and not cand.is_demo
$$;

notify pgrst, 'reload schema';
