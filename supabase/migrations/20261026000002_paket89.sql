-- Paket 89: Active Sourcing. Neues Team "Sales Recruiting + Active Sourcing"; Kandidaten mit
-- Herkunft "active_sourcing" sehen nur dieses Team und die Admins (Kanzleien weiterhin,
-- wenn ihnen ein solcher Kandidat zugeordnet ist). Abgesichert in der Datenbank, nicht nur
-- in der Oberfläche.

-- 1) Team
alter table public.profiles drop constraint if exists profiles_team_check;
alter table public.profiles add constraint profiles_team_check
  check (team in ('sales_recruiting', 'vertrieb', 'sales_recruiting_active_sourcing'));
alter table public.tasks drop constraint if exists tasks_assigned_team_check;
alter table public.tasks add constraint tasks_assigned_team_check
  check (assigned_team in ('sales_recruiting', 'vertrieb', 'sales_recruiting_active_sourcing'));

-- 2) Herkunft "Active Sourcing"
alter table public.candidates drop constraint if exists candidates_source_check;
alter table public.candidates add constraint candidates_source_check
  check (source = any (array['meta_ads', 'kanzleistelle24', 'manual', 'leadtable', 'active_sourcing']));

-- 3) Wer Active-Sourcing-Kandidaten sehen darf: Admins, das neue Team und Portal-Kunden
--    (die sehen über ihre eigene Policy ohnehin nur zugeordnete Kandidaten).
--    SECURITY DEFINER wie current_user_is_agency_admin() - liest profiles ohne RLS.
create or replace function public.current_user_sees_active_sourcing()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(role = 'agency_admin' or role = 'client' or team = 'sales_recruiting_active_sourcing', false)
  from public.profiles where id = auth.uid()
$$;

grant execute on function public.current_user_sees_active_sourcing() to authenticated;

-- 4) Einschränkende Policy: gilt zusätzlich zu allen anderen Policies auf candidates
--    (lesen, ändern, anlegen, löschen). "(select …)" wertet die Funktion einmal je Abfrage aus.
drop policy if exists "Active Sourcing nur fuer Team und Admins" on public.candidates;
create policy "Active Sourcing nur fuer Team und Admins"
on public.candidates
as restrictive
for all
to authenticated
using (source is distinct from 'active_sourcing' or coalesce((select public.current_user_sees_active_sourcing()), false))
with check (source is distinct from 'active_sourcing' or coalesce((select public.current_user_sees_active_sourcing()), false));

NOTIFY pgrst, 'reload schema';
