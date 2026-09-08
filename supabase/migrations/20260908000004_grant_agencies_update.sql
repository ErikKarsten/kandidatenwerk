-- agencies hatte bisher nur GRANT SELECT (20260715000004_grant_agencies_select.sql) -
-- kein UPDATE fuer service_role. Live beim Testen der neuen Einstellungen-Seite
-- aufgefallen: "Agentur-Name speichern" schlug mit "permission denied for table
-- agencies" fehl, obwohl der Admin-Client (service_role) RLS umgeht - Tabellen-Grants
-- sind davon unabhaengig, service_role braucht sie trotzdem explizit (gleiches Muster
-- wie 20260901000000_grant_profiles_write.sql, dort dieselbe Ursache bei profiles).
--
-- Nur UPDATE, kein INSERT/DELETE - die App legt keine neuen Agenturen an und loescht
-- keine, nur der Name der bestehenden eigenen Agentur wird bearbeitet
-- (updateAgencyNameAction in dashboard/einstellungen/actions.ts).
GRANT UPDATE ON public.agencies TO service_role;
NOTIFY pgrst, 'reload schema';
