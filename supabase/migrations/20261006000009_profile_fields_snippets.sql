-- Paket 18 (06.10.2026), T-80: Felder von Kanzleiprofil und Stellenprofil einstellbar.
--
-- profile_field_settings: Überschreibungen für eingebaute Felder (Bezeichnung, Hinweis,
-- Pflicht, sichtbar) und eigene Zusatzfelder (is_custom). Werte eigener Felder stehen in
-- client_profiles.extra bzw. client_positions.extra.
-- position_snippets: Textbausteine je Berufsbild für Aufgaben und Anforderungen
-- (vorbefüllt mit den bisherigen festen Bausteinen).
create table if not exists public.profile_field_settings (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  scope text not null check (scope in ('kanzlei', 'stelle')),
  key text not null,
  label text not null,
  hint text,
  required boolean not null default false,
  active boolean not null default true,
  multiline boolean not null default false,
  is_custom boolean not null default false,
  field_group text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (agency_id, scope, key)
);

create table if not exists public.position_snippets (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  berufsbild text not null,
  kind text not null check (kind in ('aufgaben', 'anforderungen')),
  text text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists position_snippets_lookup on public.position_snippets (agency_id, berufsbild, kind, sort_order);

alter table public.profile_field_settings enable row level security;
alter table public.position_snippets enable row level security;
create policy "Team liest Profilfeld-Einstellungen" on public.profile_field_settings for select to authenticated
  using (public.current_user_is_staff() and agency_id = public.current_user_agency_id());
create policy "Team pflegt Profilfeld-Einstellungen" on public.profile_field_settings for all to authenticated
  using (public.current_user_is_staff() and agency_id = public.current_user_agency_id())
  with check (public.current_user_is_staff() and agency_id = public.current_user_agency_id());
create policy "Team liest Textbausteine" on public.position_snippets for select to authenticated
  using (public.current_user_is_staff() and agency_id = public.current_user_agency_id());
create policy "Team pflegt Textbausteine" on public.position_snippets for all to authenticated
  using (public.current_user_is_staff() and agency_id = public.current_user_agency_id())
  with check (public.current_user_is_staff() and agency_id = public.current_user_agency_id());
grant select, insert, update, delete on public.profile_field_settings, public.position_snippets to authenticated, service_role;

alter table public.client_profiles add column if not exists extra jsonb not null default '{}'::jsonb;
alter table public.client_positions add column if not exists extra jsonb not null default '{}'::jsonb;

-- Bisherige Textbausteine je Agentur übernehmen.
insert into public.position_snippets (agency_id, berufsbild, kind, text, sort_order)
select a.id, v.berufsbild, v.kind, v.text, v.sort_order
from public.agencies a
cross join (values
('steuerfachangestellte', 'aufgaben', 'Laufende Finanzbuchhaltung für einen festen Mandantenstamm', 0),
('steuerfachangestellte', 'aufgaben', 'Lohn- und Gehaltsabrechnungen inkl. Meldungen an Sozialversicherungsträger', 1),
('steuerfachangestellte', 'aufgaben', 'Erstellung von Umsatzsteuer-Voranmeldungen', 2),
('steuerfachangestellte', 'aufgaben', 'Mitwirkung bei Jahresabschlüssen', 3),
('steuerfachangestellte', 'aufgaben', 'Erstellung betrieblicher und privater Steuererklärungen', 4),
('steuerfachangestellte', 'aufgaben', 'Prüfung von Steuerbescheiden', 5),
('steuerfachangestellte', 'aufgaben', 'Ansprechpartner/in für Mandanten in steuerlichen Alltagsfragen', 6),
('steuerfachangestellte', 'anforderungen', 'Abgeschlossene Ausbildung als Steuerfachangestellte/r', 0),
('steuerfachangestellte', 'anforderungen', 'Erste Berufserfahrung in einer Steuerkanzlei', 1),
('steuerfachangestellte', 'anforderungen', 'Sicherer Umgang mit DATEV oder vergleichbarer Software', 2),
('steuerfachangestellte', 'anforderungen', 'Selbstständige, sorgfältige und strukturierte Arbeitsweise', 3),
('steuerfachangestellte', 'anforderungen', 'Freude an der Arbeit im Team und am Kontakt mit Mandanten', 4),
('steuerfachangestellte', 'anforderungen', 'Gute Kenntnisse in MS Office, insbesondere Excel', 5),
('steuerfachangestellte', 'anforderungen', 'Sehr gute Deutschkenntnisse in Wort und Schrift', 6),
('steuerfachwirt', 'aufgaben', 'Eigenverantwortliche Betreuung eines festen Mandantenstamms', 0),
('steuerfachwirt', 'aufgaben', 'Erstellung von Jahresabschlüssen für Einzelunternehmen und Personengesellschaften', 1),
('steuerfachwirt', 'aufgaben', 'Erstellung betrieblicher und privater Steuererklärungen', 2),
('steuerfachwirt', 'aufgaben', 'Prüfung von Steuerbescheiden und Einlegen von Einsprüchen', 3),
('steuerfachwirt', 'aufgaben', 'Vorbereitung und Begleitung von Betriebsprüfungen', 4),
('steuerfachwirt', 'aufgaben', 'Fachliche Unterstützung und Anleitung von Kolleginnen und Kollegen', 5),
('steuerfachwirt', 'anforderungen', 'Erfolgreiche Fortbildung zum/zur Steuerfachwirt/in', 0),
('steuerfachwirt', 'anforderungen', 'Mehrjährige Berufserfahrung in einer Steuerkanzlei', 1),
('steuerfachwirt', 'anforderungen', 'Sicherer Umgang mit DATEV oder vergleichbarer Software', 2),
('steuerfachwirt', 'anforderungen', 'Selbstständige, sorgfältige und strukturierte Arbeitsweise', 3),
('steuerfachwirt', 'anforderungen', 'Freude an der Arbeit im Team und am Kontakt mit Mandanten', 4),
('steuerfachwirt', 'anforderungen', 'Gute Kenntnisse in MS Office, insbesondere Excel', 5),
('steuerfachwirt', 'anforderungen', 'Sehr gute Deutschkenntnisse in Wort und Schrift', 6),
('bilanzbuchhalter', 'aufgaben', 'Erstellung von Monats-, Quartals- und Jahresabschlüssen nach HGB', 0),
('bilanzbuchhalter', 'aufgaben', 'Betreuung der laufenden Finanzbuchhaltung anspruchsvoller Mandate', 1),
('bilanzbuchhalter', 'aufgaben', 'Kontenabstimmungen und Abschlussbuchungen', 2),
('bilanzbuchhalter', 'aufgaben', 'Erstellung betrieblicher Steuererklärungen', 3),
('bilanzbuchhalter', 'aufgaben', 'Mitwirkung bei Auswertungen und Reportings für Mandanten', 4),
('bilanzbuchhalter', 'aufgaben', 'Begleitung von Betriebsprüfungen', 5),
('bilanzbuchhalter', 'anforderungen', 'Weiterbildung zum/zur Bilanzbuchhalter/in (IHK) oder vergleichbare Qualifikation', 0),
('bilanzbuchhalter', 'anforderungen', 'Mehrjährige Erfahrung in der Abschlusserstellung', 1),
('bilanzbuchhalter', 'anforderungen', 'Sicherer Umgang mit DATEV oder vergleichbarer Software', 2),
('bilanzbuchhalter', 'anforderungen', 'Selbstständige, sorgfältige und strukturierte Arbeitsweise', 3),
('bilanzbuchhalter', 'anforderungen', 'Freude an der Arbeit im Team und am Kontakt mit Mandanten', 4),
('bilanzbuchhalter', 'anforderungen', 'Gute Kenntnisse in MS Office, insbesondere Excel', 5),
('bilanzbuchhalter', 'anforderungen', 'Sehr gute Deutschkenntnisse in Wort und Schrift', 6),
('steuerberater', 'aufgaben', 'Eigenverantwortliche Betreuung und Beratung eines anspruchsvollen Mandantenstamms', 0),
('steuerberater', 'aufgaben', 'Erstellung und Prüfung von Jahresabschlüssen und Steuererklärungen', 1),
('steuerberater', 'aufgaben', 'Steuerliche Gestaltungsberatung für Unternehmen und Privatpersonen', 2),
('steuerberater', 'aufgaben', 'Vertretung von Mandanten gegenüber Finanzbehörden und bei Betriebsprüfungen', 3),
('steuerberater', 'aufgaben', 'Fachliche Führung und Weiterentwicklung des Teams', 4),
('steuerberater', 'aufgaben', 'Mitwirkung an der Weiterentwicklung der Kanzlei', 5),
('steuerberater', 'anforderungen', 'Erfolgreich abgelegtes Steuerberaterexamen', 0),
('steuerberater', 'anforderungen', 'Mehrjährige Berufserfahrung in der Steuerberatung', 1),
('steuerberater', 'anforderungen', 'Unternehmerisches Denken und Freude an der Mandantenberatung', 2),
('steuerberater', 'anforderungen', 'Sicherer Umgang mit DATEV oder vergleichbarer Software', 3),
('steuerberater', 'anforderungen', 'Selbstständige, sorgfältige und strukturierte Arbeitsweise', 4),
('steuerberater', 'anforderungen', 'Freude an der Arbeit im Team und am Kontakt mit Mandanten', 5),
('sonstige', 'anforderungen', 'Sicherer Umgang mit DATEV oder vergleichbarer Software', 0),
('sonstige', 'anforderungen', 'Selbstständige, sorgfältige und strukturierte Arbeitsweise', 1),
('sonstige', 'anforderungen', 'Freude an der Arbeit im Team und am Kontakt mit Mandanten', 2),
('sonstige', 'anforderungen', 'Gute Kenntnisse in MS Office, insbesondere Excel', 3),
('sonstige', 'anforderungen', 'Sehr gute Deutschkenntnisse in Wort und Schrift', 4)
) as v(berufsbild, kind, text, sort_order)
where not exists (select 1 from public.position_snippets p where p.agency_id = a.id);

notify pgrst, 'reload schema';
