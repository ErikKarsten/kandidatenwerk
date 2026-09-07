-- Fortsetzung von 20260907000003: 116 der 121 Kandidaten ohne campaign_id haben
-- auch KEIN client_id (per Diagnose-Query vom 07.09.2026 bestaetigt) - komplett
-- unverknuepfte Kandidaten (vermutlich noch nicht triagierte Leadtable-Importe).
-- Da es aktuell nur eine einzige Agentur gibt, sollen die fuers Team trotzdem
-- sichtbar sein - es gibt schliesslich niemand anderen, dem sie "gehoeren"
-- koennten.
--
-- WICHTIG: Die Bedingung ist bewusst zusaetzlich an "aufrufender Nutzer hat eine
-- agency_id" geknuepft, nicht einfach pauschal "campaign_id is null and client_id
-- is null" - sonst waeren diese 116 Kandidaten auch fuer Kunden-Portal-Logins
-- sichtbar (deren profiles.agency_id ist NULL), was genau die Luecke wieder
-- aufreissen wuerde, die das Portal-Feature schliessen soll.
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
  or (
    campaign_id is null
    and client_id is null
    and (select profiles.agency_id from public.profiles where profiles.id = auth.uid()) is not null
  )
);

NOTIFY pgrst, 'reload schema';
