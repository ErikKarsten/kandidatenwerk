-- Security-Review vom 08./09.09.2026 (systematische RLS-Durchsicht vor weiteren
-- Kunden-Portal-Einladungen): schliesst die 6 als "kritisch" eingestuften Funde.
-- Alle sechs folgen demselben Muster wie candidates/clients/client_assignments bzw.
-- der candidate_files-Fix von dieser Woche (20260908000000) - offene
-- USING(true)/WITH CHECK(true)-Policies bzw. Altlast-Policies, die eine bereits
-- vorhandene korrekte Policy aushebeln, werden durch auf agency_id/client_id
-- gescopte Policies ersetzt. Nicht Teil dieser Migration (siehe Review-Bericht,
-- niedriger priorisierte Funde): anon-GRANT-Haertung, SUPABASE_SECRET_KEY in
-- supabase-server.ts, campaign_automations (dort fehlt der GRANT komplett - das ist
-- aktuell ein Funktions-Bug, kein Sicherheitsfund, siehe Bericht Punkt 10).

-- ============================================================
-- 1) client_contacts: 4 offene Policies (auth_delete/insert/select/update,
--    USING(true)/WITH CHECK(true)) ersetzen durch Team-der-eigenen-Agentur (ALL) +
--    Kunde-sieht-eigene-Kontakte (SELECT) - exakt das clients/candidates-Muster.
--    client_contacts hat kein direktes agency_id, deshalb der Join ueber clients.
-- ============================================================
drop policy if exists "auth_delete" on public.client_contacts;
drop policy if exists "auth_insert" on public.client_contacts;
drop policy if exists "auth_select" on public.client_contacts;
drop policy if exists "auth_update" on public.client_contacts;

create policy "Team verwaltet Kontakte der eigenen Agentur"
on public.client_contacts
for all
to authenticated
using (
  client_id in (
    select id from public.clients
    where agency_id = (select profiles.agency_id from public.profiles where profiles.id = auth.uid())
  )
)
with check (
  client_id in (
    select id from public.clients
    where agency_id = (select profiles.agency_id from public.profiles where profiles.id = auth.uid())
  )
);

create policy "Kunde sieht eigene Kontakte"
on public.client_contacts
for select
to authenticated
using (
  client_id = (select profiles.client_id from public.profiles where profiles.id = auth.uid())
);

-- ============================================================
-- 2) client_files (Tabellen-Zeilen): einzige Policy "Authenticated users can access
--    client files" (ALL/true/true) ersetzen - gleiches Muster wie client_contacts
--    oben bzw. wie candidate_files (20260908000000).
-- ============================================================
drop policy if exists "Authenticated users can access client files" on public.client_files;

create policy "Team verwaltet Dateien der eigenen Agentur"
on public.client_files
for all
to authenticated
using (
  client_id in (
    select id from public.clients
    where agency_id = (select profiles.agency_id from public.profiles where profiles.id = auth.uid())
  )
)
with check (
  client_id in (
    select id from public.clients
    where agency_id = (select profiles.agency_id from public.profiles where profiles.id = auth.uid())
  )
);

create policy "Kunde liest eigene Dateien"
on public.client_files
for select
to authenticated
using (
  client_id = (select profiles.client_id from public.profiles where profiles.id = auth.uid())
);

-- ============================================================
-- 3) storage.objects, bucket 'client-files' (Datei-Inhalte): die 3 offenen
--    Policies (nur auf bucket_id gescoped, keine Kunden-Zuordnung) ersetzen.
--    Objekt-Pfad ist `${clientId}/${Date.now()}-${file.name}` (siehe
--    uploadClientFileAction, clients/[id]/actions.ts) - exakt dasselbe
--    Pfad-Praefix-Muster wie beim candidate-files-Fix von dieser Woche
--    (20260908000000), nur ueber clients.agency_id statt candidates.
-- ============================================================
drop policy if exists "Authenticated users can read client files" on storage.objects;
drop policy if exists "Authenticated users can upload client files" on storage.objects;
drop policy if exists "Authenticated users can delete client files" on storage.objects;

create policy "Team greift auf Storage-Dateien der eigenen Agentur zu"
on storage.objects
for all
to authenticated
using (
  bucket_id = 'client-files'
  and name ~ '^[0-9a-fA-F-]{36}/'
  and (split_part(name, '/', 1))::uuid in (
    select id from public.clients
    where agency_id = (select profiles.agency_id from public.profiles where profiles.id = auth.uid())
  )
)
with check (
  bucket_id = 'client-files'
  and name ~ '^[0-9a-fA-F-]{36}/'
  and (split_part(name, '/', 1))::uuid in (
    select id from public.clients
    where agency_id = (select profiles.agency_id from public.profiles where profiles.id = auth.uid())
  )
);

create policy "Kunde liest eigene Storage-Dateien"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'client-files'
  and name ~ '^[0-9a-fA-F-]{36}/'
  and (split_part(name, '/', 1))::uuid = (select profiles.client_id from public.profiles where profiles.id = auth.uid())
);

-- ============================================================
-- 4) candidate_history: die korrekt gescopte Policy "History der eigenen
--    Kandidaten" existiert bereits und bleibt unangetastet - nur die beiden
--    daneben stehenden, offenen Altlast-Policies werden entfernt (permissive
--    Policies werden ODER-verknuepft, die offene hat die gute bisher ausgehebelt).
-- ============================================================
drop policy if exists "authenticated_insert_history" on public.candidate_history;
drop policy if exists "authenticated_select_history" on public.candidate_history;

-- ============================================================
-- 5) storage.objects, bucket 'candidate-files': die beiden korrekt gescopten
--    Policies aus 20260908000000 ("Team greift auf Storage-Dateien sichtbarer
--    Kandidaten zu", "Kunde liest Storage-Dateien zugeordneter Kandidaten")
--    bleiben unangetastet - nur die uebrig gebliebene offene Altlast-Policy
--    "authenticated_storage_candidate_files" (bucket_id-only, keine
--    Kandidaten-Zuordnung) wird entfernt, die den Fix von dieser Woche bisher
--    ausgehebelt hat.
-- ============================================================
drop policy if exists "authenticated_storage_candidate_files" on storage.objects;

-- ============================================================
-- 6) leadtable_sync_runs: rein interne Betriebsinfo (kein agency_id/client_id auf
--    der Tabelle, single-tenant) - bisher ALL/true/true fuer jeden authenticated
--    Nutzer, also auch Portal-Kunden. Jetzt auf Staff beschraenkt (jede Rolle
--    ausser "client"). War "bewusst zurueckgestellt, solange nur Staff eingeloggt
--    ist" - mit echten Kunden im Portal nicht mehr vertretbar (siehe Review-Bericht,
--    empirisch bestaetigt: Portal-Testnutzer konnte alle Sync-Laeufe lesen).
-- ============================================================
drop policy if exists "Authenticated users can access leadtable sync runs" on public.leadtable_sync_runs;

create policy "Staff verwaltet Sync-Laeufe"
on public.leadtable_sync_runs
for all
to authenticated
using ((select profiles.role from public.profiles where profiles.id = auth.uid()) <> 'client')
with check ((select profiles.role from public.profiles where profiles.id = auth.uid()) <> 'client');

-- ============================================================
-- 7) locations: rein interne PLZ-Cluster-Infos (kein agency_id/client_id, geteilt
--    ueber die ganze App). Lesen bleibt fuer alle authenticated Nutzer offen (auch
--    Portal-Kunden - matching-relevant, keine sensiblen Daten), Schreiben
--    (Insert/Update/Delete ueber die "ALL"-Policy) wird auf Staff beschraenkt.
--    service_role (Sync-Jobs) umgeht RLS ohnehin und ist von dieser Aenderung
--    nicht betroffen.
-- ============================================================
drop policy if exists "Authenticated users can access locations" on public.locations;

create policy "Authenticated users can read locations"
on public.locations
for select
to authenticated
using (true);

create policy "Staff verwaltet locations"
on public.locations
for all
to authenticated
using ((select profiles.role from public.profiles where profiles.id = auth.uid()) <> 'client')
with check ((select profiles.role from public.profiles where profiles.id = auth.uid()) <> 'client');

NOTIFY pgrst, 'reload schema';
