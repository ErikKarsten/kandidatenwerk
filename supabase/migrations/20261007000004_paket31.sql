-- Paket 31 (07.10.2026)
-- 1. Eine aktive Zuordnung je Kandidat und Kanzlei. Bisher entstand je Kampagne eine eigene
--    Zuordnung (z.B. "Stfa Bonn" und "Stfa Köln" beim selben Kunden) - im Portal stand der
--    Kandidat dann doppelt, im Backend zählte er einmal. Doppelte werden zusammengeführt:
--    es bleibt die mit dem weitesten Status (Eingestellt > Vorstellungsgespräch > Neu >
--    Abgelehnt), bei Gleichstand die älteste.
with ranked as (
  select id,
         row_number() over (
           partition by client_id, candidate_id
           order by case status when 'ja' then 1 when 'vg' then 2 when 'inbox' then 3 else 4 end, created_at
         ) as rn
  from public.client_assignments
  where removed_at is null
)
update public.client_assignments a
set removed_at = now()
from ranked r
where r.id = a.id and r.rn > 1;

create unique index if not exists client_assignments_one_active_per_client
  on public.client_assignments (client_id, candidate_id)
  where removed_at is null;

-- 2. Kundenübersicht: Pipeline nach dem Status beim Kunden statt nach dem internen
--    Kandidatenstatus (zugeordnete Kandidaten sind intern immer "vorqualifiziert").
create or replace view public.client_list_stats
with (security_invoker = true)
as
with campaign_counts as (
  select client_id, count(*) as campaign_count
  from public.campaigns
  where not is_demo
  group by client_id
),
assignment_status_counts as (
  select ca.client_id, ca.status, count(distinct ca.candidate_id) as cnt
  from public.client_assignments ca
  join public.candidates cand on cand.id = ca.candidate_id
  where ca.removed_at is null and not cand.is_demo
  group by ca.client_id, ca.status
),
candidate_totals as (
  select
    client_id,
    sum(cnt) as candidate_count,
    jsonb_agg(jsonb_build_object('status', status, 'count', cnt)) as pipeline
  from assignment_status_counts
  group by client_id
),
-- Eingestellt = Zuordnungen mit Status "ja".
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

-- 3. Kandidatenliste: Status beim Kunden (weitester Status aller aktiven Zuordnungen).
--    Ab der Zuordnung zeigt das Backend diesen statt des internen Status.
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
  cl.name as client_name,
  cand.tags,
  (
    select ca.status
    from public.client_assignments ca
    where ca.candidate_id = cand.id and ca.removed_at is null
    order by case ca.status when 'ja' then 1 when 'vg' then 2 when 'inbox' then 3 else 4 end
    limit 1
  ) as assignment_status
from public.candidates cand
left join public.campaigns camp on camp.id = cand.campaign_id
left join public.clients cl on cl.id = camp.client_id
where not cand.is_demo;
