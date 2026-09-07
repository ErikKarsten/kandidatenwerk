-- Kunden-Portal, Schritt 1 von 4: Datenbank-Grundlage.
--
-- Portal-Nutzer (profiles.role = 'client') sind KEINE Mitglieder einer agency
-- (profiles.agency_id ist bei ihnen NULL), sondern ueber profiles.client_id
-- genau einem Kunden zugeordnet. Die bestehenden "... der eigenen Agentur"-
-- Policies (siehe 20260907000000) greifen fuer sie also gar nicht - hier
-- kommen eigene, rein lesende Policies fuer die Rolle 'client' dazu.
--
-- ANNAHME (bitte pruefen): Ein Kunde sieht nur AKTIVE Zuordnungen
-- (client_assignments.removed_at IS NULL). Beendete Zuordnungen verschwinden
-- fuer ihn aus der Liste, bleiben aber fuer euer Team sichtbar. Falls Kunden
-- auch beendete Zuordnungen sehen sollen, unten die "removed_at is null"-
-- Bedingung an den zwei markierten Stellen entfernen.
--
-- Schreibrechte fuer den Status (client_assignments) bekommt die Rolle
-- 'client' bewusst NICHT - laut Absprache nur lesend.

-- ============================================================
-- 1) client_assignments war komplett offen (USING (true), siehe
--    20260901000004) - das war okay, solange nur internes Personal
--    eingeloggt war. Jetzt nicht mehr, da genau diese Tabelle steuert, was
--    ein Kunden-Portal-Login sehen darf.
-- ============================================================
drop policy if exists "Authenticated users can access client assignments" on public.client_assignments;

create policy "Team greift auf Zuordnungen der eigenen Agentur zu"
on public.client_assignments
for all
to authenticated
using (
  client_id in (
    select clients.id from public.clients
    where clients.agency_id = (select profiles.agency_id from public.profiles where profiles.id = auth.uid())
  )
)
with check (
  client_id in (
    select clients.id from public.clients
    where clients.agency_id = (select profiles.agency_id from public.profiles where profiles.id = auth.uid())
  )
);

create policy "Kunde sieht eigene Zuordnungen (nur lesend)"
on public.client_assignments
for select
to authenticated
using (
  removed_at is null
  and client_id = (select profiles.client_id from public.profiles where profiles.id = auth.uid())
);

-- ============================================================
-- 2) clients: Kunde darf den eigenen Kundendatensatz lesen (fuer Name/Logo
--    im Portal-Header). Bestehende "Clients der eigenen Agentur"-Policy
--    bleibt unangetastet, diese kommt nur ergaenzend dazu.
-- ============================================================
create policy "Kunde sieht eigenen Kundendatensatz"
on public.clients
for select
to authenticated
using (
  id = (select profiles.client_id from public.profiles where profiles.id = auth.uid())
);

-- ============================================================
-- 3) candidates: Kunde darf nur Kandidaten sehen, die ihm aktiv zugeordnet
--    sind (volle Stammdaten + Zusatzfelder, siehe Spezifikation).
-- ============================================================
create policy "Kunde sieht zugeordnete Kandidaten (nur lesend)"
on public.candidates
for select
to authenticated
using (
  id in (
    select client_assignments.candidate_id from public.client_assignments
    where client_assignments.removed_at is null
      and client_assignments.client_id = (select profiles.client_id from public.profiles where profiles.id = auth.uid())
  )
);

-- ============================================================
-- 4) Eigene Notizen des Kunden im Portal - bewusst NICHT candidate_history
--    (das ist der interne "Verlauf", den Kunden laut Spezifikation nicht
--    sehen sollen), sondern eine eigene, pro Zuordnung gefuehrte Tabelle.
--    Kunde kann schreiben und spaeter selbst wiederlesen, euer Team sieht
--    sie ebenfalls.
-- ============================================================
create table public.client_assignment_notes (
  id uuid primary key default gen_random_uuid(),
  client_assignment_id uuid not null references public.client_assignments(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  content text not null,
  created_at timestamptz not null default now()
);

create index idx_client_assignment_notes_assignment_id on public.client_assignment_notes (client_assignment_id);

alter table public.client_assignment_notes enable row level security;

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
)
with check (
  client_assignment_id in (
    select ca.id from public.client_assignments ca
    join public.clients c on c.id = ca.client_id
    where c.agency_id = (select profiles.agency_id from public.profiles where profiles.id = auth.uid())
  )
);

create policy "Kunde liest/schreibt eigene Notizen"
on public.client_assignment_notes
for all
to authenticated
using (
  client_assignment_id in (
    select ca.id from public.client_assignments ca
    where ca.client_id = (select profiles.client_id from public.profiles where profiles.id = auth.uid())
  )
)
with check (
  client_assignment_id in (
    select ca.id from public.client_assignments ca
    where ca.client_id = (select profiles.client_id from public.profiles where profiles.id = auth.uid())
  )
);

grant select, insert, update, delete on public.client_assignment_notes to authenticated, service_role;

-- ============================================================
-- 5) tasks war ebenfalls komplett offen (siehe 20260901000003) - ohne
--    eigene Agentur-/Kunden-Spalte in der Tabelle ist die einfachste
--    korrekte Loesung: nur die Rolle 'client' komplett aussperren, euer
--    Team behaelt vollen Zugriff wie bisher.
-- ============================================================
drop policy if exists "Authenticated users can access tasks" on public.tasks;

create policy "Nur Agentur-Team greift auf Aufgaben zu"
on public.tasks
for all
to authenticated
using (
  (select profiles.role from public.profiles where profiles.id = auth.uid()) in ('agency_admin', 'agency_member')
)
with check (
  (select profiles.role from public.profiles where profiles.id = auth.uid()) in ('agency_admin', 'agency_member')
);

NOTIFY pgrst, 'reload schema';
