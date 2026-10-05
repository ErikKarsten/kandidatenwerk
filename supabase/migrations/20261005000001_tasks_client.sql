-- Paket 13 (05.10.2026): Aufgaben können einem Kunden zugeordnet sein (Reiter
-- "Aufgaben" beim Kunden, automatische Aufgabe "Kampagnenstatus prüfen" beim
-- Phasenwechsel). Zugriff wie bisher: nur das Team (Policy aus 20260907000001).
alter table public.tasks
  add column if not exists client_id uuid references public.clients(id) on delete cascade;

create index if not exists idx_tasks_client_id on public.tasks (client_id);

notify pgrst, 'reload schema';

-- Kundenliste (Paket 13): Projektphase, Key Account Manager und Profilstatus als
-- Spalten/Filter. Kandidaten zählen jetzt über die aktiven Zuordnungen
-- (client_assignments) statt über die Herkunfts-Kampagne - seit dem Neuimport haben
-- Kandidaten keine Kanzlei-Kampagne als Herkunft mehr (alle Kunden zeigten 0).
-- Neue Spalten nur hinten anhängen (create or replace view).
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
  where ca.removed_at is null
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

grant select on public.client_list_stats to authenticated;

notify pgrst, 'reload schema';

-- Aufräumen (Paket 13): "Qualifizierte Kandidaten" gibt es seit T-37 nicht mehr, die
-- Tabelle ist leer und wird nirgends genutzt. Nur löschen, wenn wirklich leer.
do $$
begin
  if to_regclass('public.qualified_candidates') is not null
     and not exists (select 1 from public.qualified_candidates) then
    drop table public.qualified_candidates;
  end if;
end $$;

notify pgrst, 'reload schema';
