-- Nachtrag zu 20260910000003_qualified_candidates.sql: die Tabelle bekam eine
-- RLS-Policy, aber keinen GRANT - ohne GRANT kommt weder authenticated noch
-- service_role an die Tabelle (RLS allein reicht nicht, siehe schon
-- campaign_automations im Security-Review vom 09.09.2026 - derselbe Fehlertyp).
-- Aufgefallen, weil scripts/refresh-qualified-candidates.ts (läuft mit dem
-- service_role-Client) mit "permission denied for table qualified_candidates"
-- scheiterte.
grant select, insert, update, delete on public.qualified_candidates to authenticated, service_role;

NOTIFY pgrst, 'reload schema';
