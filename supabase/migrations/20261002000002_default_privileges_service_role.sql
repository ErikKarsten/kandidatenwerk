-- Wiederkehrende Fehlerklasse "GRANT vergessen" (Atlas T-3, Entscheidung Erik
-- 02.10.2026: Option B + C): neue Tabellen/Sequenzen/Funktionen im Schema public
-- bekommen ab jetzt AUTOMATISCH die Rechte für service_role (Server Actions mit
-- Admin-Client, Cron-Jobs, Skripte). Mehrere Nachzügler-Migrationen gab es nur, weil
-- genau das gefehlt hat (z.B. 20260727000000_grant_profiles_select_service_role.sql,
-- 20260922000002_fix_automation_engine_permissions.sql).
--
-- Bewusst NICHT für "authenticated": Dort bleibt jedes GRANT explizit pro Migration.
-- Ein automatisches Recht für alle Logins würde jede neue Tabelle sofort auch für
-- Portal-Kunden öffnen, sobald bei einer Migration die RLS-Policy fehlt.
--
-- Default Privileges gelten nur für Objekte, die von der angegebenen Rolle angelegt
-- werden. Der Supabase SQL Editor führt als "postgres" aus - daher FOR ROLE postgres.
-- Gilt nur für künftig angelegte Objekte; bestehende Tabellen bleiben unverändert.

alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to service_role;

alter default privileges for role postgres in schema public
  grant usage, select on sequences to service_role;

alter default privileges for role postgres in schema public
  grant execute on functions to service_role;
