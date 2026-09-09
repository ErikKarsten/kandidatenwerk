-- Security-Review vom 08./09.09.2026, zweiter Teil: schliesst die 6 als
-- "mittel"/"niedrig" eingestuften Funde (aktuell nicht akut ausnutzbar, aber sauber
-- zu schliessen vor weiteren Kunden-Portal-Einladungen). Wie bei
-- 20260909000000_fix_critical_open_rls_policies.sql: bestehende korrekte Policies
-- bleiben unangetastet, nur Altlast-Policies bzw. fehlende Policies werden ersetzt/
-- ergaenzt. Laeuft als eine Transaktion (Supabase SQL Editor) - die in Abschnitt 5
-- beschriebene Reihenfolge (erst RLS, dann GRANT) ist dadurch ohnehin atomar, keine
-- andere Session sieht einen Zwischenzustand; die Reihenfolge im Skript wird trotzdem
-- wie gewuenscht eingehalten.

-- ============================================================
-- 1) profiles: "Authenticated users can read all profiles" (SELECT/true, siehe
--    20260901000002) war ein bewusster, aber zu weiter Fix fuer eine
--    Autorenanzeige-Luecke - wird ersetzt durch eine auf die eigene Agentur
--    gescopte Policy. "Eigenes Profil sehen" (id = auth.uid()) bleibt unangetastet
--    und sorgt dafuer, dass jeder (auch Portal-Kunden) weiterhin das eigene Profil
--    sieht. Die neue Policy traegt fuer Portal-Kunden nichts bei (ihr eigenes
--    profiles.agency_id ist NULL, siehe inviteClientPortalUserAction) - sie sehen
--    dadurch weiterhin nur sich selbst.
-- ============================================================
drop policy if exists "Authenticated users can read all profiles" on public.profiles;

create policy "Staff sieht Profile der eigenen Agentur"
on public.profiles
for select
to authenticated
using (
  agency_id = (select profiles.agency_id from public.profiles where profiles.id = auth.uid())
);

-- ============================================================
-- 2) agencies: die korrekt gescopte Policy "Eigene Agentur sehen" (id = eigene
--    profiles.agency_id) existiert bereits - nur die daneben stehende offene
--    Altlast-Policy "agency_admin_agencies" (ALL/true) wird entfernt. Schreiben lief
--    ohnehin schon ueber den Admin-Client in updateAgencyNameAction (siehe
--    Kommentar dort) - service_role umgeht RLS, ist von diesem Drop nicht betroffen.
-- ============================================================
drop policy if exists "agency_admin_agencies" on public.agencies;

-- ============================================================
-- 3) storage.objects, bucket 'client-logos': Lesen bleibt bewusst oeffentlich
--    (storage_select unveraendert - Logo-Anzeige im Portal/Dashboard braucht keine
--    Anmeldung). Schreiben/Loeschen (storage_insert/update/delete, bisher nur auf
--    bucket_id gescoped) wird auf den Kunden aus dem Objekt-Pfad beschraenkt.
--    Pfad ist `${clientId}/logo.${ext}` (siehe uploadClientLogoAction,
--    clients/[id]/actions.ts) - gleiches Praefix-Muster wie candidate-files/
--    client-files, nur ohne separate Kunde-Policy (das Kunden-Portal hat keine
--    Logo-Upload-Funktion, nur Staff laedt Logos hoch).
-- ============================================================
drop policy if exists "storage_insert" on storage.objects;
drop policy if exists "storage_update" on storage.objects;
drop policy if exists "storage_delete" on storage.objects;

create policy "Team verwaltet Logos der eigenen Agentur"
on storage.objects
for all
to authenticated
using (
  bucket_id = 'client-logos'
  and name ~ '^[0-9a-fA-F-]{36}/'
  and (split_part(name, '/', 1))::uuid in (
    select id from public.clients
    where agency_id = (select profiles.agency_id from public.profiles where profiles.id = auth.uid())
  )
)
with check (
  bucket_id = 'client-logos'
  and name ~ '^[0-9a-fA-F-]{36}/'
  and (split_part(name, '/', 1))::uuid in (
    select id from public.clients
    where agency_id = (select profiles.agency_id from public.profiles where profiles.id = auth.uid())
  )
);

-- ============================================================
-- 4) campaign_automations: RLS ERST auf "nur Staff der eigenen Agentur" scopen
--    (Abschnitt 4a), DANACH erst den fehlenden Tabellen-GRANT ergaenzen
--    (Abschnitt 4b) - in dieser Reihenfolge, damit zu keinem Zeitpunkt eine offene
--    RLS-Policy auf eine frisch gegrantete Tabelle trifft. campaign_automations hat
--    kein direktes client_id/agency_id, Zuordnung laeuft ueber campaign_id ->
--    campaigns.client_id -> clients.agency_id (siehe "Campaigns der eigenen
--    Agentur"-Policy auf campaigns). Kein Portal-Kunden-Zugriff vorgesehen - das
--    Feature hat keine Portal-UI.
-- ============================================================

-- 4a) RLS zuerst
drop policy if exists "auth_delete" on public.campaign_automations;
drop policy if exists "auth_insert" on public.campaign_automations;
drop policy if exists "auth_select" on public.campaign_automations;
drop policy if exists "auth_update" on public.campaign_automations;

create policy "Team verwaltet Automatisierungen der eigenen Agentur"
on public.campaign_automations
for all
to authenticated
using (
  campaign_id in (
    select id from public.campaigns
    where client_id in (
      select id from public.clients
      where agency_id = (select profiles.agency_id from public.profiles where profiles.id = auth.uid())
    )
  )
)
with check (
  campaign_id in (
    select id from public.campaigns
    where client_id in (
      select id from public.clients
      where agency_id = (select profiles.agency_id from public.profiles where profiles.id = auth.uid())
    )
  )
);

-- 4b) GRANT danach - fehlte komplett (auch fuer service_role, siehe Review-Bericht
--     Punkt 10), das Feature war dadurch bislang fuer niemanden nutzbar, nicht nur
--     fuer Portal-Kunden blockiert.
grant select, insert, update, delete on public.campaign_automations to authenticated, service_role;

-- ============================================================
-- 5) anon-GRANT-Haertung: anon (voellig unauthentifizierte Postgres-Rolle) braucht
--    auf keiner der 16 public-Tabellen Lese-/Schreibrechte - die App kennt keinen
--    anonymen Datenzugriff, jede Route ist entweder oeffentlich ohne DB-Zugriff
--    (Login-Seite) oder verlangt eine Session. War bisher an mehreren Tabellen zu
--    weit gefasst (siehe Review-Bericht Punkt 11) - aktuell nicht ausnutzbar (RLS
--    blockt ueber NULL-auth.uid() bzw. TO authenticated-Einschraenkung), aber ohne
--    zusaetzlichen Nutzen und daher als Verteidigung-in-der-Tiefe entfernt.
-- ============================================================
revoke all on
  public.agencies,
  public.campaigns,
  public.campaign_automations,
  public.candidate_campaign_matches,
  public.candidate_files,
  public.candidate_history,
  public.candidates,
  public.client_assignment_notes,
  public.client_assignments,
  public.client_contacts,
  public.client_files,
  public.clients,
  public.leadtable_sync_runs,
  public.locations,
  public.profiles,
  public.tasks
from anon;

NOTIFY pgrst, 'reload schema';
