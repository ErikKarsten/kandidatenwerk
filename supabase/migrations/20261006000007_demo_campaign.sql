-- Paket 18 (06.10.2026), T-82: Beispielkampagne für neue Kunden.
-- Neben "Max Mustermann (Beispiel)" bekommt jeder neue Kunde eine Beispiel-Kanzlei-Kampagne,
-- in der der Beispiel-Lead liegt. is_demo hält sie aus Zählungen, Listen und Matching heraus.
alter table public.campaigns add column if not exists is_demo boolean not null default false;

create or replace view public.client_list_stats
with (security_invoker = true)
as
with campaign_counts as (
  select client_id, count(*) as campaign_count
  from public.campaigns
  where not is_demo
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
