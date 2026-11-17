-- Paket 106 (17.11.2026): Neuer Status einer Zuordnung "In Kontakt" (kontakt), gemeldet als
-- Fehlermeldung 3dfbacec. Die Kanzlei hat sich beim Kandidaten gemeldet, ein Gespräch steht
-- noch nicht fest. Sie darf ihn im Kundenportal selbst setzen, wie die übrigen Status.

-- 1) Erlaubte Werte der Spalte client_assignments.status erweitern.
alter table public.client_assignments drop constraint if exists client_assignments_status_check;
alter table public.client_assignments
  add constraint client_assignments_status_check
  check (status in ('inbox', 'vq', 'vqk', 'kontakt', 'vg', 'ja', 'nein', 'abgesagt'));

-- 2) Portal-Kunden dürfen den neuen Status setzen (sonst unverändert, Stand Paket 101).
drop policy if exists "Kunde aendert Status der eigenen aktiven Zuordnung" on public.client_assignments;
create policy "Kunde aendert Status der eigenen aktiven Zuordnung"
on public.client_assignments
for update
to authenticated
using (
  removed_at is null
  and client_id = (select profiles.client_id from public.profiles where profiles.id = (select auth.uid()))
)
with check (
  removed_at is null
  and client_id = (select profiles.client_id from public.profiles where profiles.id = (select auth.uid()))
  and status in ('kontakt', 'vg', 'ja', 'nein', 'abgesagt')
);

-- 3) Kandidatenliste: Bei mehreren Zuordnungen zeigt die Liste den weitesten Status.
--    "In Kontakt" liegt zwischen Vorstellungsgespräch und Neu. Die Sicht wird aus ihrer
--    aktuellen Definition umgeschrieben, damit spätere Änderungen erhalten bleiben.
do $$
declare
  def text := pg_get_viewdef('public.candidate_list_rows'::regclass);
  neu text;
begin
  neu := regexp_replace(
    def,
    'WHEN ''vg''::text THEN 2(\s+)WHEN ''inbox''::text THEN 3(\s+)ELSE 4',
    'WHEN ''vg''::text THEN 2\1WHEN ''kontakt''::text THEN 3\1WHEN ''inbox''::text THEN 4\2ELSE 5'
  );
  if neu = def then
    raise exception 'candidate_list_rows: Status-Reihenfolge nicht gefunden';
  end if;
  execute 'create or replace view public.candidate_list_rows with (security_invoker = true) as ' || neu;
end $$;

NOTIFY pgrst, 'reload schema';
