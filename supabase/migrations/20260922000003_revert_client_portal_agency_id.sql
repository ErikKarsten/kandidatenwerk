-- SICHERHEITSFIX (22.09.2026): Setzt Portal-Kunden-Profile zurück auf agency_id = NULL.
--
-- Der Fix in inviteClientPortalUserAction vom 22.09.2026 (Commit 3633e60, "agency_id
-- setzen, damit Staff neue Portal-Zugänge sieht") hat agency_id bei neu eingeladenen
-- Portal-Kunden vom zugehörigen Kunden übernommen. Mehrere "eigene Agentur"-RLS-Policies
-- (clients, candidates, client_contacts, client_files, campaign_automations, profiles,
-- Storage-Buckets) gehen aber davon aus, dass Portal-Kunden agency_id = NULL haben -
-- durch den Fix sahen betroffene Portal-Logins plötzlich ALLE Daten ALLER Agenturen
-- statt nur ihre eigenen (live bestätigt: ein Portal-Login sah alle 201 Kampagnen und
-- 66 Kandidaten im System). Diese Migration nimmt das zurück; der zugehörige Code-Fix
-- (agency_id in inviteClientPortalUserAction nicht mehr setzen) ist separat committet.
--
-- Bewusstes Nebenergebnis: das ursprüngliche, harmlose Anzeige-Problem (Staff sieht neu
-- angelegte Portal-Zugänge in der eigenen Liste nicht) kommt dadurch zurück. Der
-- dauerhafte, sichere Fix dafür (z.B. Rollenprüfung statt geteilter agency_id in der
-- Policy) folgt separat.
update public.profiles
set agency_id = null
where role = 'client' and agency_id is not null;
