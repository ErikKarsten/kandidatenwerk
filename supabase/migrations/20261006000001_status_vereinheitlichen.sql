-- Paket 15 (06.10.2026), T-71: Status vereinheitlichen.
--
-- Interner Kandidatenstatus ohne Interview/Vorgestellt/Platziert - den Stand beim Kunden
-- bildet die Zuordnung ab (client_assignments.status: Neu, Vorstellungsgespräch,
-- Eingestellt, Abgelehnt; überall gleich benannt, siehe src/lib/assignment-status.ts).

-- 1. Bestehende Kandidaten mit Interview/Vorgestellt/Platziert -> Vorqualifiziert,
--    mit Verlaufsnotiz zum alten Status.
insert into public.candidate_history (candidate_id, type, content)
select id, 'note',
  'Status von „' || case status when 'interview' then 'Interview' when 'vorgestellt' then 'Vorgestellt' else 'Platziert' end
  || '“ auf „Vorqualifiziert“ umgestellt (Status vereinheitlicht).'
from public.candidates
where status in ('interview', 'vorgestellt', 'platziert');

update public.candidates set status = 'vorqualifiziert' where status in ('interview', 'vorgestellt', 'platziert');

alter table public.candidates drop constraint if exists candidates_status_check;
alter table public.candidates add constraint candidates_status_check
  check (status = any (array['neu', 'vorqualifiziert', 'in_pruefung', 'nicht_erreicht', 'nicht_erreicht_mail', 'in_kontakt', 'abgelehnt', 'Archiviert']));

-- 2. Interne Vorstufen der Zuordnung (vq/vqk) entfallen -> Neu.
update public.client_assignments set status = 'inbox' where status in ('vq', 'vqk');

-- 3. Automatisierungen aus dem Leadtable-Import hatten den Anzeigenamen statt des
--    Status-Werts gespeichert und lösten deshalb nie aus.
update public.campaign_automations set trigger_status = case trigger_status
    when 'Unbearbeitet' then 'neu'
    when 'Vorqualifiziert' then 'vorqualifiziert'
    when 'In Prüfung' then 'in_pruefung'
    when 'Nicht erreicht' then 'nicht_erreicht'
    when '2x nicht erreicht + Mail' then 'nicht_erreicht_mail'
    when 'In Kontakt' then 'in_kontakt'
    when 'Absage' then 'abgelehnt'
    when 'Abgelehnt' then 'abgelehnt'
    when 'interview' then 'vorqualifiziert'
    when 'vorgestellt' then 'vorqualifiziert'
    when 'platziert' then 'vorqualifiziert'
    else trigger_status
  end
where trigger = 'status_change';

-- 4. Kundenliste: Platzierungen zählen "Eingestellt" beim Kunden.
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
    jsonb_agg(jsonb_build_object('status', status, 'count', cnt)) as pipeline
  from candidate_status_counts
  group by client_id
),
-- Platzierungen = Zuordnungen, die der Kunde auf "Eingestellt" (ja) gesetzt hat.
placements as (
  select ca.client_id, count(distinct ca.candidate_id) as placement_count
  from public.client_assignments ca
  join public.candidates cand on cand.id = ca.candidate_id
  where ca.removed_at is null and ca.status = 'ja' and not cand.is_demo
  group by ca.client_id
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
  coalesce(pl.placement_count, 0)::integer as placement_count,
  coalesce(ct.pipeline, '[]'::jsonb) as pipeline,
  c.project_phase,
  c.key_account_manager_id,
  (cp.finalized_at is not null) as profile_finalized
from public.clients c
left join campaign_counts cc on cc.client_id = c.id
left join candidate_totals ct on ct.client_id = c.id
left join placements pl on pl.client_id = c.id
left join public.client_profiles cp on cp.client_id = c.id;

notify pgrst, 'reload schema';
