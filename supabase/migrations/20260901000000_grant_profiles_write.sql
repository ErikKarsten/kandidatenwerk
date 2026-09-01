-- profiles fehlten bisher jegliche Schreibrechte für service_role (nur SELECT war
-- gegrantet, siehe 20260727000000_grant_profiles_select_service_role.sql) - dadurch
-- konnte z.B. kein Profil-Datensatz für einen neu eingeladenen Auth-User per Skript/
-- Server-Action nachgezogen werden (aufgefallen beim Versuch, das fehlende Profil für
-- c.hohler@endlich-mitarbeiter.de anzulegen: "permission denied for table profiles").
-- Gleiches Muster wie bei leadtable_sync_runs (20260805000001) - RLS-Policy allein
-- reicht nicht, PostgREST-Rollen brauchen zusätzlich explizite Tabellen-Grants.
GRANT INSERT, UPDATE, DELETE ON public.profiles TO service_role;
NOTIFY pgrst, 'reload schema';
