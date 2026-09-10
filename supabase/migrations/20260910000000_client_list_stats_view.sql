-- Performance-Überarbeitung, zweiter (größerer) Umbau: /dashboard/clients lud bisher
-- zusätzlich zur Kundenliste komplett campaigns (id, client_id) UND candidates
-- (campaign_id, status) und aggregierte Kandidaten-/Kampagnen-/Platzierungszahlen pro
-- Kunde in zwei verschachtelten JS-Maps (siehe Performance-Review 09.09.2026, Punkt 2) -
-- 771 Zeilen (155 Kampagnen + 616 Kandidaten) bei jedem Aufruf, nur fuer Zahlen. Dazu
-- clientseitige Pagination/Suche/Sortierung obendrauf.
--
-- Ersetzt durch eine View mit echter SQL-Aggregation, gegen die PostgREST ganz normal
-- filtern/sortieren/paginieren kann (.eq/.ilike/.order/.range/count:"exact") - kein RPC
-- noetig, da hier (anders als bei getForwardedCount) keine reine Zahl, sondern eine
-- Zeile pro Kunde mit mehreren Feldern + Pagination gebraucht wird.
--
-- security_invoker = true (Postgres 15+) ist hier entscheidend: ohne diese Option
-- liefe die View mit den Rechten des View-Eigentuemers und wuerde die RLS-Policies von
-- clients/campaigns/candidates fuer die aufrufende Rolle umgehen - jede Agentur saehe
-- dann ALLE Kunden statt nur die eigenen. Mit security_invoker=true respektiert die
-- View exakt dieselbe RLS wie eine direkte Tabellenabfrage (siehe "Clients der eigenen
-- Agentur"-Policy auf clients). Nur von /dashboard/clients genutzt (Staff-only, das
-- Kunden-Portal hat keine eigene Kundenliste) - fuer Portal-Kunden ohnehin irrelevant.
--
-- Indizes fuer die Aggregation (candidates.campaign_id, campaigns.client_id) existieren
-- bereits seit 20260905000000_add_performance_indexes.sql.
create or replace view public.client_list_stats
with (security_invoker = true)
as
with campaign_counts as (
  select client_id, count(*) as campaign_count
  from public.campaigns
  group by client_id
),
candidate_status_counts as (
  select camp.client_id, cand.status, count(*) as cnt
  from public.candidates cand
  join public.campaigns camp on camp.id = cand.campaign_id
  group by camp.client_id, cand.status
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
  coalesce(ct.pipeline, '[]'::jsonb) as pipeline
from public.clients c
left join campaign_counts cc on cc.client_id = c.id
left join candidate_totals ct on ct.client_id = c.id;

grant select on public.client_list_stats to authenticated;

NOTIFY pgrst, 'reload schema';
