-- Kunden-Portal: Status-Änderung durch den Kunden (Anfrage vom 28.09.2026).
--
-- Bisher (siehe 20260907000001_client_portal_rls_foundation.sql, Kommentar
-- "Schreibrechte fuer den Status (client_assignments) bekommt die Rolle 'client'
-- bewusst NICHT - laut Absprache nur lesend"): reine SELECT-Policy für 'client'.
-- Jetzt kommt gezielt EINE UPDATE-Policy dazu, die NUR die Spalte "status" auf genau
-- den drei kundenrelevanten Endzuständen (vg/ja/nein) für die EIGENE, aktive
-- Zuordnung erlaubt - alle internen Vorstufen (inbox/vq/vqk) bleiben als Zielwert
-- für 'client' explizit ausgeschlossen (siehe WITH CHECK unten).
--
-- WICHTIG zur Spalten-Beschränkung: Postgres-RLS-Policies wirken zeilenweise (USING/
-- WITH CHECK sehen jeweils nur EINE Zeilenversion), können also für sich allein nicht
-- verhindern, dass eine ansonsten erlaubte UPDATE-Anweisung auch andere Spalten
-- derselben Zeile mitändert (z.B. candidate_id, client_id, removed_at). Das wird hier
-- deshalb zusätzlich durch einen BEFORE-UPDATE-Trigger abgesichert, der für
-- Nicht-Staff-Nutzer (also praktisch nur Portal-Kunden) jede Änderung an einer anderen
-- Spalte als "status" hart ablehnt - unabhängig davon, was die aufrufende Anwendung
-- im UPDATE-Statement mitschickt.

-- ============================================================
-- 1) BEFORE-UPDATE-Trigger: Nicht-Staff darf nur "status" ändern.
-- ============================================================
create or replace function public.enforce_client_status_only_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Kein eingeloggter Nutzer (Service-Role-Client, z.B. Server Actions mit Admin-Client
  -- oder Wartungs-/Sync-Skripte - dort ist auth.uid() immer NULL) ODER Staff
  -- (agency_admin/agency_member, z.B. assignToClientAction, removeClientAssignmentAction,
  -- updateAssignmentStatusAction): keine Einschränkung, wie bisher. Nur eine eingeloggte
  -- Portal-Kunden-Session (hat immer ein auth.uid(), sonst könnte sie die Zeile über RLS
  -- gar nicht erst erreichen) wird unten geprüft.
  if auth.uid() is null or public.current_user_is_staff() then
    return new;
  end if;

  if new.candidate_id is distinct from old.candidate_id
     or new.client_id is distinct from old.client_id
     or new.created_at is distinct from old.created_at
     or new.created_by is distinct from old.created_by
     or new.removed_at is distinct from old.removed_at
  then
    raise exception 'Portal-Kunden dürfen nur den Status der eigenen Zuordnung ändern.';
  end if;

  return new;
end;
$$;

drop trigger if exists client_assignments_client_status_only on public.client_assignments;

create trigger client_assignments_client_status_only
before update on public.client_assignments
for each row
execute function public.enforce_client_status_only_update();

-- ============================================================
-- 2) Neue UPDATE-Policy für 'client': nur die eigene, aktive Zuordnung, nur auf
--    einen der drei kundenrelevanten Endzustände. Bestehende SELECT-Policy
--    "Kunde sieht eigene Zuordnungen (nur lesend)" bleibt unverändert bestehen -
--    diese Policy kommt rein additiv für UPDATE dazu.
-- ============================================================
create policy "Kunde aendert Status der eigenen aktiven Zuordnung"
on public.client_assignments
for update
to authenticated
using (
  removed_at is null
  and client_id = (select profiles.client_id from public.profiles where profiles.id = auth.uid())
)
with check (
  removed_at is null
  and client_id = (select profiles.client_id from public.profiles where profiles.id = auth.uid())
  and status in ('vg', 'ja', 'nein')
);

NOTIFY pgrst, 'reload schema';
