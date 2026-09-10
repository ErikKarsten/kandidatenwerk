-- Performance-Überarbeitung, erster Testlauf: getForwardedCount() in src/lib/kpis.ts
-- lud bisher ALLE client_assignments.candidate_id-Zeilen (global oder pro Kunde) und
-- zaehlte Distinct-Werte in JS via `new Set(...).size` - reine In-Memory-Zaehlung statt
-- echter SQL-Aggregation. PostgREST bietet kein natives COUNT(DISTINCT ...) über den
-- REST-Endpunkt (der count-Header zaehlt nur Gesamtzeilen), daher hier eine kleine
-- SQL-Funktion statt einer PostgREST-Query.
--
-- SECURITY INVOKER (Standard) bewusst statt DEFINER - respektiert die RLS-Policy der
-- aufrufenden Rolle (Staff sieht nur Zuordnungen der eigenen Agentur), genau wie eine
-- normale PostgREST-Query es auch täte. Aufrufer sind ausschliesslich Staff-Seiten
-- (Dashboard, Kunden-Detail), nie das Kunden-Portal - siehe src/lib/kpis.ts.
create or replace function public.count_distinct_forwarded_candidates(p_client_id uuid default null)
returns integer
language sql
stable
security invoker
set search_path = public
as $$
  select count(distinct candidate_id)::integer
  from client_assignments
  where p_client_id is null or client_id = p_client_id
$$;

grant execute on function public.count_distinct_forwarded_candidates(uuid) to authenticated;

NOTIFY pgrst, 'reload schema';
