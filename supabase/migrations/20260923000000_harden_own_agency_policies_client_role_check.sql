-- STRUKTURELLER FIX für den Security-Incident vom 22./23.09.2026 (agency_id bei
-- Portal-Kunden-Logins, akut geschlossen durch Migration 20260922000003 + Code-Revert
-- Commit c67f8de). Die akute Ursache war ein einzelner Bug (inviteClientPortalUserAction
-- setzte agency_id bei neuen Portal-Kunden fälschlich mit) - diese Migration schließt die
-- strukturelle Lücke dahinter.
--
-- Sehr viele "... der eigenen Agentur"-Policies (meist FOR ALL, also volles
-- Schreibrecht) prüfen nur "agency_id = eigene profiles.agency_id" bzw. teils sogar nur
-- "agency_id IS NOT NULL" als Stellvertreter für "ist Staff". Die Annahme dahinter -
-- Portal-Kunden-Profile (role='client') haben IMMER agency_id=NULL - wird nirgends per
-- Constraint erzwungen, nur per Konvention im Code eingehalten. Genau diese Annahme
-- wurde am 22.09. gebrochen: jedes Mal wenn das nochmal passiert (jetzt oder in
-- Zukunft), bekommen Portal-Kunden-Logins sofort wieder vollen Zugriff auf ALLE
-- Agentur-Daten. Diese Migration macht das strukturell unmöglich, indem jede dieser
-- Policies zusätzlich explizit prüft, dass die aufrufende Rolle NICHT 'client' ist -
-- unabhängig vom Wert von agency_id. Sonstige Logik der Policies bleibt unverändert.

-- ============================================================
-- 0) Neue Hilfsfunktion current_user_is_staff(), analog zu current_user_agency_id()
--    (siehe 20260909000002_hotfix_profiles_policy_recursion.sql) - SECURITY DEFINER,
--    fragt profiles OHNE RLS ab. Wichtig: exakt dieses Pattern, keine rohe Subquery
--    direkt in einer Policy AUF profiles selbst - sonst genau die "infinite
--    recursion" (42P17), die im Hotfix beschrieben ist.
-- ============================================================
create or replace function public.current_user_is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select role <> 'client' from public.profiles where id = auth.uid()
$$;

grant execute on function public.current_user_is_staff() to authenticated;

-- ============================================================
-- 1) clients
-- ============================================================
drop policy if exists "Clients der eigenen Agentur" on public.clients;

create policy "Clients der eigenen Agentur"
on public.clients
for all
to authenticated
using (
  agency_id = (select profiles.agency_id from public.profiles where profiles.id = auth.uid())
  and public.current_user_is_staff()
)
with check (
  agency_id = (select profiles.agency_id from public.profiles where profiles.id = auth.uid())
  and public.current_user_is_staff()
);

-- ============================================================
-- 2) candidates (aktuellste Version aus 20260907000004) - FOR ALL, TO public, kein
--    WITH CHECK (Postgres nutzt USING dann auch für Schreiboperationen). Die dritte
--    OR-Bedingung nutzt bereits "agency_id IS NOT NULL" als Staff-Proxy inline -
--    bleibt hier unverändert stehen (wird durch die neue äußere Bedingung ohnehin
--    überstimmt, falls role = 'client'), nur candidate_files/candidate-files-Storage
--    unten bekommen die saubere Ersetzung, wie explizit gewünscht.
-- ============================================================
drop policy if exists "Candidates der eigenen Agentur" on public.candidates;

create policy "Candidates der eigenen Agentur"
on public.candidates
for all
to public
using (
  (
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
  )
  and public.current_user_is_staff()
);

-- ============================================================
-- 3) client_assignments
-- ============================================================
drop policy if exists "Team greift auf Zuordnungen der eigenen Agentur zu" on public.client_assignments;

create policy "Team greift auf Zuordnungen der eigenen Agentur zu"
on public.client_assignments
for all
to authenticated
using (
  client_id in (
    select clients.id from public.clients
    where clients.agency_id = (select profiles.agency_id from public.profiles where profiles.id = auth.uid())
  )
  and public.current_user_is_staff()
)
with check (
  client_id in (
    select clients.id from public.clients
    where clients.agency_id = (select profiles.agency_id from public.profiles where profiles.id = auth.uid())
  )
  and public.current_user_is_staff()
);

-- ============================================================
-- 4) client_assignment_notes
-- ============================================================
drop policy if exists "Team liest/schreibt Notizen der eigenen Agentur" on public.client_assignment_notes;

create policy "Team liest/schreibt Notizen der eigenen Agentur"
on public.client_assignment_notes
for all
to authenticated
using (
  client_assignment_id in (
    select ca.id from public.client_assignments ca
    join public.clients c on c.id = ca.client_id
    where c.agency_id = (select profiles.agency_id from public.profiles where profiles.id = auth.uid())
  )
  and public.current_user_is_staff()
)
with check (
  client_assignment_id in (
    select ca.id from public.client_assignments ca
    join public.clients c on c.id = ca.client_id
    where c.agency_id = (select profiles.agency_id from public.profiles where profiles.id = auth.uid())
  )
  and public.current_user_is_staff()
);

-- ============================================================
-- 5) client_contacts
-- ============================================================
drop policy if exists "Team verwaltet Kontakte der eigenen Agentur" on public.client_contacts;

create policy "Team verwaltet Kontakte der eigenen Agentur"
on public.client_contacts
for all
to authenticated
using (
  client_id in (
    select id from public.clients
    where agency_id = (select profiles.agency_id from public.profiles where profiles.id = auth.uid())
  )
  and public.current_user_is_staff()
)
with check (
  client_id in (
    select id from public.clients
    where agency_id = (select profiles.agency_id from public.profiles where profiles.id = auth.uid())
  )
  and public.current_user_is_staff()
);

-- ============================================================
-- 6) client_files (Tabellen-Zeilen)
-- ============================================================
drop policy if exists "Team verwaltet Dateien der eigenen Agentur" on public.client_files;

create policy "Team verwaltet Dateien der eigenen Agentur"
on public.client_files
for all
to authenticated
using (
  client_id in (
    select id from public.clients
    where agency_id = (select profiles.agency_id from public.profiles where profiles.id = auth.uid())
  )
  and public.current_user_is_staff()
)
with check (
  client_id in (
    select id from public.clients
    where agency_id = (select profiles.agency_id from public.profiles where profiles.id = auth.uid())
  )
  and public.current_user_is_staff()
);

-- ============================================================
-- 7) storage.objects, bucket 'client-files' (Datei-Inhalte)
-- ============================================================
drop policy if exists "Team greift auf Storage-Dateien der eigenen Agentur zu" on storage.objects;

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
  and public.current_user_is_staff()
)
with check (
  bucket_id = 'client-files'
  and name ~ '^[0-9a-fA-F-]{36}/'
  and (split_part(name, '/', 1))::uuid in (
    select id from public.clients
    where agency_id = (select profiles.agency_id from public.profiles where profiles.id = auth.uid())
  )
  and public.current_user_is_staff()
);

-- ============================================================
-- 8) storage.objects, bucket 'client-logos'
-- ============================================================
drop policy if exists "Team verwaltet Logos der eigenen Agentur" on storage.objects;

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
  and public.current_user_is_staff()
)
with check (
  bucket_id = 'client-logos'
  and name ~ '^[0-9a-fA-F-]{36}/'
  and (split_part(name, '/', 1))::uuid in (
    select id from public.clients
    where agency_id = (select profiles.agency_id from public.profiles where profiles.id = auth.uid())
  )
  and public.current_user_is_staff()
);

-- ============================================================
-- 9) campaign_automations
-- ============================================================
drop policy if exists "Team verwaltet Automatisierungen der eigenen Agentur" on public.campaign_automations;

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
  and public.current_user_is_staff()
)
with check (
  campaign_id in (
    select id from public.campaigns
    where client_id in (
      select id from public.clients
      where agency_id = (select profiles.agency_id from public.profiles where profiles.id = auth.uid())
    )
  )
  and public.current_user_is_staff()
);

-- ============================================================
-- 10) profiles - FOR SELECT (kein WITH CHECK). Läuft über current_user_is_staff(),
--     das (wie current_user_agency_id() bereits seit dem Hotfix) SECURITY DEFINER
--     profiles ohne RLS abfragt - keine Rekursion, obwohl die Policy selbst AUF
--     profiles liegt.
-- ============================================================
drop policy if exists "Staff sieht Profile der eigenen Agentur" on public.profiles;

create policy "Staff sieht Profile der eigenen Agentur"
on public.profiles
for select
to authenticated
using (
  agency_id = public.current_user_agency_id()
  and public.current_user_is_staff()
);

-- ============================================================
-- 11) qualified_candidates - nutzt bereits current_user_agency_id()
-- ============================================================
drop policy if exists "Qualifizierte Kandidaten der eigenen Agentur" on public.qualified_candidates;

create policy "Qualifizierte Kandidaten der eigenen Agentur"
on public.qualified_candidates
for all
to authenticated
using (
  candidate_id in (
    select candidates.id from public.candidates
    where candidates.campaign_id in (
      select campaigns.id from public.campaigns
      where campaigns.client_id in (
        select clients.id from public.clients
        where clients.agency_id = public.current_user_agency_id()
      )
    )
    or candidates.client_id in (
      select clients.id from public.clients
      where clients.agency_id = public.current_user_agency_id()
    )
  )
  and public.current_user_is_staff()
);

-- ============================================================
-- 12) email_templates
-- ============================================================
drop policy if exists "Team verwaltet Email-Vorlagen der eigenen Agentur" on public.email_templates;

create policy "Team verwaltet Email-Vorlagen der eigenen Agentur"
on public.email_templates
for all
to authenticated
using (
  agency_id = (select profiles.agency_id from public.profiles where profiles.id = auth.uid())
  and public.current_user_is_staff()
)
with check (
  agency_id = (select profiles.agency_id from public.profiles where profiles.id = auth.uid())
  and public.current_user_is_staff()
);

-- ============================================================
-- 13) candidate_files (Tabellen-Zeilen) - nutzte bisher "agency_id IS NOT NULL" als
--     reinen Staff-Proxy. Wird hier direkt durch den Funktionsaufruf ERSETZT statt
--     nur ergänzt (sauberer, wie gewünscht) - identische Bedeutung, kein neues
--     Verhalten.
-- ============================================================
drop policy if exists "Team greift auf Dateien sichtbarer Kandidaten zu" on public.candidate_files;

create policy "Team greift auf Dateien sichtbarer Kandidaten zu"
on public.candidate_files
for all
to authenticated
using (
  candidate_id in (select id from public.candidates)
  and public.current_user_is_staff()
)
with check (
  candidate_id in (select id from public.candidates)
  and public.current_user_is_staff()
);

-- ============================================================
-- 14) storage.objects, bucket 'candidate-files' - gleiche Ersetzung wie oben.
-- ============================================================
drop policy if exists "Team greift auf Storage-Dateien sichtbarer Kandidaten zu" on storage.objects;

create policy "Team greift auf Storage-Dateien sichtbarer Kandidaten zu"
on storage.objects
for all
to authenticated
using (
  bucket_id = 'candidate-files'
  and public.current_user_is_staff()
  and name ~ '^[0-9a-fA-F-]{36}/'
  and (split_part(name, '/', 1))::uuid in (select id from public.candidates)
)
with check (
  bucket_id = 'candidate-files'
  and public.current_user_is_staff()
  and name ~ '^[0-9a-fA-F-]{36}/'
  and (split_part(name, '/', 1))::uuid in (select id from public.candidates)
);

-- ============================================================
-- 15) candidate_campaign_matches - nicht auf der ursprünglichen Liste, beim
--     Durchsuchen der Migrations-Historie zusätzlich gefunden (gleiches Muster,
--     kein Rollen-Check). FOR ALL, TO public, kein WITH CHECK.
-- ============================================================
drop policy if exists "Matches der eigenen Agentur" on public.candidate_campaign_matches;

create policy "Matches der eigenen Agentur"
on public.candidate_campaign_matches
for all
to public
using (
  campaign_id in (
    select campaigns.id from public.campaigns
    where campaigns.client_id in (
      select clients.id from public.clients
      where clients.agency_id = (
        select profiles.agency_id from public.profiles where profiles.id = auth.uid()
      )
    )
  )
  and public.current_user_is_staff()
);

-- ============================================================
-- 16) campaigns - die "eigene Agentur"-Policy fürs Team existiert (siehe Kommentar
--     in 20260908000003_client_portal_campaigns_read.sql: "bestehende
--     Agentur-Policy auf campaigns"), ihr genauer Name/USING-Ausdruck steht aber in
--     KEINER Migration - sie stammt aus der allerersten Schema-Erstellung direkt im
--     Supabase-Dashboard, vor Beginn der Migrations-Historie. Wird deshalb zur
--     Laufzeit über pg_policies gesucht statt den Namen zu raten - bricht mit einer
--     klaren Fehlermeldung ab, falls nicht genau eine passende Policy gefunden wird,
--     statt etwas Falsches zu tun.
-- ============================================================
do $$
declare
  pol record;
  match_count int;
  new_using text;
  new_check text;
  create_sql text;
begin
  select count(*) into match_count
  from pg_policies
  where schemaname = 'public' and tablename = 'campaigns'
    and (qual ilike '%agency_id%' or coalesce(with_check, '') ilike '%agency_id%');

  if match_count = 0 then
    raise exception 'Keine agency_id-basierte Policy auf public.campaigns gefunden - bitte Abschnitt 16 dieser Migration manuell anpassen.';
  elsif match_count > 1 then
    raise exception 'Mehrere agency_id-basierte Policies auf public.campaigns gefunden (%) - nicht eindeutig, bitte Abschnitt 16 dieser Migration manuell anpassen.', match_count;
  end if;

  select policyname, cmd, roles, qual, with_check into pol
  from pg_policies
  where schemaname = 'public' and tablename = 'campaigns'
    and (qual ilike '%agency_id%' or coalesce(with_check, '') ilike '%agency_id%');

  if pol.qual ilike '%current_user_is_staff%' then
    raise notice 'Policy "%" auf public.campaigns ist bereits gehaertet, ueberspringe Abschnitt 16.', pol.policyname;
  else
    execute format('drop policy %I on public.campaigns', pol.policyname);

    new_using := '(' || pol.qual || ') AND public.current_user_is_staff()';

    if pol.with_check is not null then
      new_check := '(' || pol.with_check || ') AND public.current_user_is_staff()';
      create_sql := format(
        'create policy %I on public.campaigns for %s to %s using (%s) with check (%s)',
        pol.policyname, pol.cmd, array_to_string(pol.roles, ', '), new_using, new_check
      );
    else
      create_sql := format(
        'create policy %I on public.campaigns for %s to %s using (%s)',
        pol.policyname, pol.cmd, array_to_string(pol.roles, ', '), new_using
      );
    end if;

    raise notice 'campaigns-Policy "%" neu angelegt mit ergaenztem Staff-Check.', pol.policyname;
    execute create_sql;
  end if;
end $$;

NOTIFY pgrst, 'reload schema';
