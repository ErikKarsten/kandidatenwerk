-- "Fehler melden" (Atlas T-26, 02.10.2026): Team und Portal-Kunden melden Fehler über
-- einen Button in der Seitenleiste.
--   - Meldung von Staff (agency_admin/agency_member): wird sofort zur Aufgabe (tasks).
--   - Meldung eines Portal-Kunden: Mail an die Admins, Aufgabe erst nach Freigabe.
-- Admins sehen und bearbeiten alle Meldungen unter /dashboard/fehlermeldungen.
--
-- Zugriff bewusst NUR über Server Actions mit dem Service-Role-Client
-- (src/lib/bug-reports/actions.ts, mit Rollenprüfung aus src/lib/auth-guards.ts):
-- RLS ist aktiv, aber ohne Policy für "authenticated" - kein Login kann die Tabelle
-- direkt lesen oder schreiben. Das hält Portal-Kunden (agency_id = NULL) sicher heraus,
-- ohne neue Sonderfälle in den Agentur-Policies.

create table public.bug_reports (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid references public.agencies(id) on delete cascade,
  reporter_id uuid references public.profiles(id) on delete set null,
  reporter_role text not null,
  client_id uuid references public.clients(id) on delete set null,
  title text not null check (char_length(title) between 1 and 150),
  description text not null check (char_length(description) between 1 and 4000),
  page_url text,
  user_agent text,
  status text not null default 'neu'
    check (status in ('neu', 'in_pruefung', 'freigegeben', 'abgelehnt', 'erledigt')),
  review_note text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  task_id uuid references public.tasks(id) on delete set null,
  created_at timestamptz not null default now()
);

create index bug_reports_agency_status_idx on public.bug_reports (agency_id, status, created_at desc);
create index bug_reports_task_id_idx on public.bug_reports (task_id);

alter table public.bug_reports enable row level security;

grant select, insert, update, delete on public.bug_reports to service_role;

-- Wer Aufgaben aus Fehlermeldungen zugewiesen bekommt (einstellbar auf
-- /dashboard/fehlermeldungen). NULL = erster Admin der Agentur.
alter table public.agencies
  add column bug_report_assignee_id uuid references public.profiles(id) on delete set null;

notify pgrst, 'reload schema';
