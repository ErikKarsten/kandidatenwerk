-- Paket 13 (05.10.2026): Aufgaben können einem Kunden zugeordnet sein (Reiter
-- "Aufgaben" beim Kunden, automatische Aufgabe "Kampagnenstatus prüfen" beim
-- Phasenwechsel). Zugriff wie bisher: nur das Team (Policy aus 20260907000001).
alter table public.tasks
  add column if not exists client_id uuid references public.clients(id) on delete cascade;

create index if not exists idx_tasks_client_id on public.tasks (client_id);

notify pgrst, 'reload schema';
