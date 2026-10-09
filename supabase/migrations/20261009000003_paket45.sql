-- Paket 45: Berufsbilder in den Einstellungen pflegbar (Einstellungen > Felder) statt fest
-- im Code. Schlüssel bleiben fest (sie stehen an Kandidaten, Kampagnen, Stellen und
-- Textbausteinen), Bezeichnung, Reihenfolge und aktiv/inaktiv sind änderbar. Neu:
-- Finanzbuchhalter und Lohnbuchhalter.
create table if not exists public.berufsbilder (
  key text primary key check (key ~ '^[a-z0-9_]+$'),
  label text not null check (length(trim(label)) > 0),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.berufsbilder enable row level security;
-- Lesen dürfen alle Angemeldeten (auch das Kundenportal zeigt die Bezeichnungen).
drop policy if exists "Angemeldete lesen Berufsbilder" on public.berufsbilder;
create policy "Angemeldete lesen Berufsbilder" on public.berufsbilder for select to authenticated using (true);
drop policy if exists "Admins pflegen Berufsbilder" on public.berufsbilder;
create policy "Admins pflegen Berufsbilder" on public.berufsbilder for all to authenticated
  using ((select public.current_user_is_agency_admin()))
  with check ((select public.current_user_is_agency_admin()));
grant select on public.berufsbilder to authenticated;
grant insert, update on public.berufsbilder to authenticated;
grant all on public.berufsbilder to service_role;

insert into public.berufsbilder (key, label, sort_order) values
  ('steuerfachangestellte', 'Steuerfachangestellte', 10),
  ('steuerfachwirt', 'Steuerfachwirt', 20),
  ('bilanzbuchhalter', 'Bilanzbuchhalter', 30),
  ('finanzbuchhalter', 'Finanzbuchhalter', 40),
  ('lohnbuchhalter', 'Lohnbuchhalter', 50),
  ('steuerberater', 'Steuerberater', 60),
  ('sonstige', 'Sonstige', 1000)
on conflict (key) do nothing;

-- Feste Listen durch Verweise auf die Tabelle ersetzen.
alter table public.candidates drop constraint if exists candidates_berufsbild_check;
alter table public.campaigns drop constraint if exists campaigns_berufsbild_check;
alter table public.candidates drop constraint if exists candidates_berufsbild_fkey;
alter table public.candidates add constraint candidates_berufsbild_fkey foreign key (berufsbild) references public.berufsbilder (key) on update cascade;
alter table public.campaigns drop constraint if exists campaigns_berufsbild_fkey;
alter table public.campaigns add constraint campaigns_berufsbild_fkey foreign key (berufsbild) references public.berufsbilder (key) on update cascade;
alter table public.client_positions drop constraint if exists client_positions_berufsbild_fkey;
alter table public.client_positions add constraint client_positions_berufsbild_fkey foreign key (berufsbild) references public.berufsbilder (key) on update cascade;
alter table public.position_snippets drop constraint if exists position_snippets_berufsbild_fkey;
alter table public.position_snippets add constraint position_snippets_berufsbild_fkey foreign key (berufsbild) references public.berufsbilder (key) on update cascade;
