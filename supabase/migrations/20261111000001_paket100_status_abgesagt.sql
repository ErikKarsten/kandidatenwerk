-- Paket 100 (11.11.2026): Neuer Status einer Zuordnung "Bewerber hat abgesagt" (abgesagt).
-- Die Kanzlei darf ihn im Kundenportal selbst setzen, wie Vorstellungsgespräch, Eingestellt
-- und Abgelehnt.

-- 1) Erlaubte Werte der Spalte client_assignments.status erweitern. Die alte Prüfregel wurde
--    beim Anlegen der Tabelle ohne festen Namen erzeugt, deshalb per Suche entfernen.
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.client_assignments'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.client_assignments drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.client_assignments
  add constraint client_assignments_status_check
  check (status in ('inbox', 'vq', 'vqk', 'vg', 'ja', 'nein', 'abgesagt'));

-- 2) Portal-Kunden dürfen den neuen Status setzen (sonst unverändert).
drop policy if exists "Kunde aendert Status der eigenen aktiven Zuordnung" on public.client_assignments;
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
  and status in ('vg', 'ja', 'nein', 'abgesagt')
);

NOTIFY pgrst, 'reload schema';
