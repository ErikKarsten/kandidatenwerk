-- Performance-Überarbeitung, dritter (größter) Umbau: /dashboard/candidates lud bisher
-- ALLE Kandidaten (aktuell 616, inkl. Joins zu campaigns/clients) und machte Suche
-- (Name+E-Mail), Filter (Status/Berufsbild/Quelle), Sortierung und Pagination komplett
-- im Client (siehe Performance-Review 09.09.2026, Punkt 3).
--
-- Anders als bei client_list_stats braucht es hier KEINE Aggregation - candidates ist
-- schon die Basistabelle, ein PostgREST-Embedded-Select (candidates.select("...,
-- campaigns(...)")) würde fürs Filtern/Sortieren/Paginieren eigentlich reichen. Eine
-- View ist trotzdem nötig fürs EINE Feature, das PostgREST nicht direkt kann: die
-- bestehende Suche sucht in "Vorname Nachname" ZUSAMMEN (nicht in first_name/last_name
-- getrennt) - ein reines .or(first_name.ilike...,last_name.ilike...) würde z.B. "Max
-- Muster" nicht finden, wenn "Max" im Vornamen und "Muster" im Nachnamen steht. Die View
-- stellt dafür ein berechnetes full_name-Feld bereit, gegen das PostgREST ganz normal
-- mit .ilike() filtern kann - exakt dasselbe Suchverhalten wie vorher.
--
-- security_invoker = true aus demselben Grund wie bei client_list_stats: ohne diese
-- Option würde die View mit den Rechten des View-Eigentuemers laufen und die
-- RLS-Policies von candidates/campaigns/clients fuer die aufrufende Rolle umgehen.
-- Nur von /dashboard/candidates genutzt (Staff-only).
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
left join public.clients cl on cl.id = camp.client_id;

grant select on public.candidate_list_rows to authenticated, service_role;

NOTIFY pgrst, 'reload schema';
