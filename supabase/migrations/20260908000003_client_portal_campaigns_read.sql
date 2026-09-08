-- Kunden-Portal, "Meine Kampagnen": campaigns hat bisher KEINE Policy für die Rolle
-- 'client' (geprüft am 2026-09-08, siehe 20260907000001_client_portal_rls_foundation.sql -
-- dort wurden clients/candidates/client_assignments abgedeckt, campaigns fehlte). Die
-- bestehende Agentur-Policy auf campaigns greift für Portal-Nutzer nicht (deren
-- profiles.agency_id ist NULL, siehe Kommentar in 20260907000001) - ohne diese Policy
-- liefert jede campaigns-Query im Portal einfach 0 Zeilen.
--
-- Gleiches Muster wie "Kunde sieht zugeordnete Kandidaten (nur lesend)" auf candidates:
-- rein lesend, nur die eigenen campaigns (client_id = profiles.client_id).
--
-- Bewusst OHNE Einschränkung auf status <> 'Archiviert' hier auf DB-Ebene - das "nur
-- aktuell laufende Kampagnen"-Filtern passiert in der Portal-Seite selbst (analog zu
-- client_assignments.removed_at, das ja auch nicht auf DB-Policy-Ebene, sondern über die
-- "removed_at is null"-Bedingung in der Policy selbst gefiltert wird - hier gibt es aber
-- keine Lösch-/Entfernungs-Spalte auf campaigns, nur den Status, den die Seite ohnehin
-- für die Anzeige braucht).

create policy "Kunde sieht Kampagnen des eigenen Kunden (nur lesend)"
on public.campaigns
for select
to authenticated
using (
  client_id = (select profiles.client_id from public.profiles where profiles.id = auth.uid())
);

NOTIFY pgrst, 'reload schema';
