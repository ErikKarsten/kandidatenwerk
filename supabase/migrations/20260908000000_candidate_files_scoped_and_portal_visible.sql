-- Kunden-Portal, letzter offener Punkt: Kunden sollen die hochgeladenen Dateien
-- (v.a. Lebenslauf) ihrer zugeordneten Kandidaten sehen koennen. Beim Nachsehen
-- (Diagnose-Query vom 08.09.2026) stellte sich heraus: candidate_files war - wie schon
-- einige andere Tabellen aus der Vor-Migrations-Zeit - komplett offen (drei
-- USING(true)-Policies), UND der zugehoerige Storage-Bucket "candidate-files" ebenso
-- (siehe 20260608000002_storage_rls.sql, "Authenticated users can ..." fuer bucket_id
-- = 'candidate-files', ohne jede Einschraenkung). Das haette bedeutet: jeder
-- eingeloggte Nutzer - auch ein zukuenftiger Kunden-Portal-Login - koennte JEDE Datei
-- JEDES Kandidaten lesen/hochladen/loeschen, unabhaengig von Zuordnung oder Agentur.
-- Wird hier mit demselben Muster wie candidates/clients/client_assignments
-- geschlossen.
--
-- storage.objects hat keine direkte Spalte fuer candidate_id - die Zuordnung steckt im
-- Objekt-Pfad (siehe uploadFileAction, candidates/[id]/actions.ts:
-- `${candidateId}/${Date.now()}-${file.name}`). Die Policies unten lesen deshalb den
-- ersten Pfad-Teil vor dem "/" aus und pruefen ihn gegen die (durch die
-- candidates-Policy bereits RLS-gescopte) candidates-Tabelle. Ein Regex-Vorab-Check
-- verhindert einen Cast-Fehler, falls doch mal ein Objekt ohne UUID-Pfad-Praefix im
-- Bucket landet. WITH CHECK prueft bewusst NUR den Pfad (nicht ob schon eine
-- candidate_files-Zeile existiert) - der Storage-Upload passiert in uploadFileAction
-- VOR dem candidate_files-Insert, ein Check auf eine existierende Zeile wuerde jeden
-- neuen Upload blockieren.

-- ── candidate_files (Tabellen-Zeilen) ──────────────────────────────────────────
drop policy if exists "authenticated_delete_candidate_files" on public.candidate_files;
drop policy if exists "authenticated_insert_candidate_files" on public.candidate_files;
drop policy if exists "authenticated_select_candidate_files" on public.candidate_files;

create policy "Team greift auf Dateien sichtbarer Kandidaten zu"
on public.candidate_files
for all
to authenticated
using (
  candidate_id in (select id from public.candidates)
  and (select profiles.agency_id from public.profiles where profiles.id = auth.uid()) is not null
)
with check (
  candidate_id in (select id from public.candidates)
  and (select profiles.agency_id from public.profiles where profiles.id = auth.uid()) is not null
);

create policy "Kunde liest Dateien zugeordneter Kandidaten"
on public.candidate_files
for select
to authenticated
using (
  candidate_id in (
    select client_assignments.candidate_id from public.client_assignments
    where client_assignments.removed_at is null
      and client_assignments.client_id = (select profiles.client_id from public.profiles where profiles.id = auth.uid())
  )
);

-- ── storage.objects, bucket 'candidate-files' (Datei-Inhalte) ─────────────────
drop policy if exists "Authenticated users can read candidate files" on storage.objects;
drop policy if exists "Authenticated users can upload candidate files" on storage.objects;
drop policy if exists "Authenticated users can delete candidate files" on storage.objects;

create policy "Team greift auf Storage-Dateien sichtbarer Kandidaten zu"
on storage.objects
for all
to authenticated
using (
  bucket_id = 'candidate-files'
  and (select profiles.agency_id from public.profiles where profiles.id = auth.uid()) is not null
  and name ~ '^[0-9a-fA-F-]{36}/'
  and (split_part(name, '/', 1))::uuid in (select id from public.candidates)
)
with check (
  bucket_id = 'candidate-files'
  and (select profiles.agency_id from public.profiles where profiles.id = auth.uid()) is not null
  and name ~ '^[0-9a-fA-F-]{36}/'
  and (split_part(name, '/', 1))::uuid in (select id from public.candidates)
);

create policy "Kunde liest Storage-Dateien zugeordneter Kandidaten"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'candidate-files'
  and name ~ '^[0-9a-fA-F-]{36}/'
  and (split_part(name, '/', 1))::uuid in (
    select client_assignments.candidate_id from public.client_assignments
    where client_assignments.removed_at is null
      and client_assignments.client_id = (select profiles.client_id from public.profiles where profiles.id = auth.uid())
  )
);

NOTIFY pgrst, 'reload schema';
