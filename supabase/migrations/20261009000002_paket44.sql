-- Paket 44: Teams zusätzlich zur Rolle (Admin/Mitarbeiter bleibt für die Rechte).
-- Team-Mitglieder gehören optional zu "Sales Recruiting" oder "Vertrieb"; Aufgaben lassen
-- sich statt einer Person einem ganzen Team zuweisen - alle Mitglieder sehen sie dann als
-- ihre Aufgabe.
alter table public.profiles add column if not exists team text;
alter table public.profiles drop constraint if exists profiles_team_check;
alter table public.profiles add constraint profiles_team_check check (team in ('sales_recruiting', 'vertrieb'));

alter table public.tasks add column if not exists assigned_team text;
alter table public.tasks drop constraint if exists tasks_assigned_team_check;
alter table public.tasks add constraint tasks_assigned_team_check check (assigned_team in ('sales_recruiting', 'vertrieb'));
alter table public.tasks alter column assigned_to drop not null;
alter table public.tasks drop constraint if exists tasks_assignee_check;
alter table public.tasks add constraint tasks_assignee_check check (assigned_to is not null or assigned_team is not null);
create index if not exists idx_tasks_assigned_team on public.tasks (assigned_team);
