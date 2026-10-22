-- Paket 83: Leads aus der eigenen Meta-Kampagne einer Kanzlei gehören nur in diese
-- Kampagne - nicht in "Alle Kandidaten", nicht auf die Karte, nicht in die passenden
-- Kandidaten anderer Kanzleien.
alter table public.candidates
  add column if not exists campaign_only boolean not null default false;

-- Bisher importierte Leads solcher Kampagnen (Grass + Hellstern, Paket 80/81).
update public.candidates c
set campaign_only = true
from public.campaigns k
where c.campaign_id = k.id
  and k.kind = 'kanzlei'
  and k.meta_form_id is not null
  and c.source = 'meta_ads';

-- "Alle Kandidaten" ohne diese Leads (sonst unverändert, siehe 20261014000001_paket66.sql).
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
  ) as assignment_status,
  coalesce((
    select jsonb_agg(jsonb_build_object('client_id', ca.client_id, 'client_name', acl.name, 'status', ca.status) order by ca.created_at)
    from public.client_assignments ca
    join public.clients acl on acl.id = ca.client_id
    where ca.candidate_id = cand.id and ca.removed_at is null
  ), '[]'::jsonb) as assignments,
  cand.updated_at
from public.candidates cand
left join public.campaigns camp on camp.id = cand.campaign_id
left join public.clients cl on cl.id = camp.client_id
where not cand.is_demo
  and not cand.campaign_only;

NOTIFY pgrst, 'reload schema';
