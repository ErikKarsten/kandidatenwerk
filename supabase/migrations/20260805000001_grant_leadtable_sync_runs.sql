-- leadtable_sync_runs fehlten die expliziten Tabellen-Grants (RLS-Policy allein reicht
-- nicht - PostgREST-Rollen brauchen zusätzlich GRANT-Rechte, siehe dasselbe Muster bei
-- candidate_campaign_matches in 20260715000002_grant_candidate_campaign_matches.sql).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leadtable_sync_runs TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
