-- Nebenfund beim Testen des Kunden-Portals (07.09.2026): Seit die offene
-- "agency_admin_candidates"-Policy entfernt wurde (20260907000000), sind 121
-- Kandidaten fuer das gesamte Team unsichtbar geworden - Stecktafel-importierte
-- Kandidaten (siehe scripts/import-stecktafel-assignments.ts) haengen direkt ueber
-- candidates.client_id an ihrem Kunden, NICHT ueber campaign_id/campaigns wie der
-- Rest. Die "Candidates der eigenen Agentur"-Policy hat diesen zweiten Pfad noch nie
-- abgedeckt - das war vorher nur durch die offene Policy daneben verdeckt, keine neue
-- Regression durch die RLS-Migration selbst, sondern eine bereits vorher bestehende
-- Luecke, die jetzt erst sichtbar wurde.
--
-- Gleiches Prinzip bei clients: 8 Stecktafel-importierte Kunden haben agency_id =
-- NULL, weil der Insert in import-stecktafel-assignments.ts (anders als der
-- Leadtable-Kunden-Import) das Feld nie gesetzt hat. Auch hier: bisher durch die
-- offene "authenticated_read_clients"-Policy verdeckt. Das Skript selbst wird
-- separat gefixt, damit das beim naechsten Stecktafel-Import nicht wieder passiert.

-- 1) Bestehende Kunden ohne agency_id nachtragen (einzige Agentur im System, siehe
--    DEFAULT_AGENCY_ID in src/lib/leadtable-import-customers.ts)
update public.clients
set agency_id = '00000000-0000-0000-0000-000000000001'
where agency_id is null;

-- 2) candidates-Policy um den direkten client_id-Pfad erweitern
drop policy if exists "Candidates der eigenen Agentur" on public.candidates;

create policy "Candidates der eigenen Agentur"
on public.candidates
for all
to public
using (
  campaign_id in (
    select campaigns.id from public.campaigns
    where campaigns.client_id in (
      select clients.id from public.clients
      where clients.agency_id = (select profiles.agency_id from public.profiles where profiles.id = auth.uid())
    )
  )
  or
  client_id in (
    select clients.id from public.clients
    where clients.agency_id = (select profiles.agency_id from public.profiles where profiles.id = auth.uid())
  )
);

NOTIFY pgrst, 'reload schema';
