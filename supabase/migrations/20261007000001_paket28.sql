-- Paket 28 (07.10.2026)
-- 1. Tags für Kandidaten (T-115) + Liste aller vergebenen Tags
-- 2. Zusatzfeld "Startdatum" heißt "Kündigungsfrist" (T-111)
-- 3. Per KI aufbereitete Benefits für Kanzleistelle24 am Kanzleiprofil (T-113)
-- 4. Geschwindigkeit (T-114): Indizes auf Fremdschlüsseln/Filtern, RLS-Hilfsfunktionen
--    nur noch einmal je Abfrage statt je Zeile auswerten
-- 5. 12 Musterkandidaten mit Tag "Musterdatensatz" (T-115)

-- 1. Tags -----------------------------------------------------------------------------
alter table public.candidates add column if not exists tags text[] not null default '{}';
create index if not exists candidates_tags_idx on public.candidates using gin (tags);

-- Spalte tags am Ende ergänzt (create or replace view erlaubt nur neue Spalten hinten).
create or replace view public.candidate_list_rows
with (security_invoker = true)
as
select
  cand.id,
  cand.first_name,
  cand.last_name,
  (cand.first_name || ' ' || cand.last_name) as full_name,
  cand.email,
  cand.status,
  cand.berufsbild,
  cand.source,
  cand.created_at,
  cand.custom_fields,
  cand.campaign_id,
  camp.title as campaign_title,
  camp.client_id,
  cl.name as client_name,
  cand.tags
from public.candidates cand
left join public.campaigns camp on camp.id = cand.campaign_id
left join public.clients cl on cl.id = camp.client_id
where not cand.is_demo;

create or replace view public.candidate_tag_list
with (security_invoker = true)
as
select distinct unnest(tags) as tag from public.candidates;

grant select on public.candidate_tag_list to authenticated;

-- 2. Kündigungsfrist ------------------------------------------------------------------
update public.custom_field_definitions
set label = 'Kündigungsfrist'
where key = 'verfuegbar_ab' and label in ('Startdatum', 'Verfügbar ab');

-- 3. Benefits für Kanzleistelle24 -----------------------------------------------------
alter table public.client_profiles
  add column if not exists kanzleistelle_benefits text[],
  add column if not exists kanzleistelle_working_model text,
  add column if not exists kanzleistelle_benefits_hash text;

-- 4a. Indizes: nur anlegen, wenn die Spalte nicht schon als erste Spalte eines Index dient.
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('candidates', 'campaign_id'), ('candidates', 'client_id'), ('candidates', 'created_at'),
      ('candidates', 'status'), ('candidates', 'source'), ('candidates', 'email'),
      ('candidate_history', 'candidate_id'), ('candidate_files', 'candidate_id'),
      ('candidate_campaign_matches', 'candidate_id'), ('candidate_campaign_matches', 'campaign_id'),
      ('candidate_messages', 'candidate_id'), ('candidate_mail_runs', 'candidate_id'),
      ('client_assignments', 'candidate_id'), ('client_assignments', 'client_id'), ('client_assignments', 'campaign_id'),
      ('client_assignment_notes', 'client_assignment_id'),
      ('client_comments', 'client_id'), ('client_contacts', 'client_id'), ('client_files', 'client_id'),
      ('client_locations', 'client_id'), ('client_positions', 'client_id'), ('client_profiles', 'client_id'),
      ('campaigns', 'client_id'), ('campaigns', 'agency_id'), ('campaigns', 'meta_campaign_id'), ('campaigns', 'meta_form_id'),
      ('campaign_ad_areas', 'campaign_id'), ('campaign_automations', 'campaign_id'),
      ('campaign_automation_runs', 'candidate_id'),
      ('tasks', 'assigned_to'), ('tasks', 'candidate_id'), ('tasks', 'client_id'),
      ('profiles', 'client_id'), ('profiles', 'agency_id'), ('clients', 'agency_id'), ('clients', 'close_lead_id'),
      ('cron_job_runs', 'job'), ('close_meeting_summaries', 'status')
    ) as v(tbl, col)
  loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = r.tbl and column_name = r.col
    ) and not exists (
      select 1
      from pg_index i
      join pg_class t on t.oid = i.indrelid
      join pg_namespace n on n.oid = t.relnamespace
      join pg_attribute a on a.attrelid = t.oid and a.attnum = i.indkey[0]
      where n.nspname = 'public' and t.relname = r.tbl and a.attname = r.col
    ) then
      execute format('create index %I on public.%I (%I)', r.tbl || '_' || r.col || '_idx', r.tbl, r.col);
    end if;
  end loop;
end $$;

-- 4b. RLS: Hilfsfunktionen in (select ...) verpacken - Postgres wertet sie dann einmal je
-- Abfrage aus (InitPlan) statt für jede Zeile erneut (jeweils eine profiles-Abfrage).
-- Gleiche Logik, nur schneller (Supabase-Empfehlung "Call functions with select").
do $$
declare
  p record;
  q text;
  w text;
  fn constant text := '(public\.)?(current_user_is_staff|current_user_agency_id|current_user_is_agency_admin)\(\)';
begin
  for p in select schemaname, tablename, policyname, qual, with_check from pg_policies where schemaname = 'public' loop
    q := p.qual;
    w := p.with_check;
    if q is not null and q ~ fn and q !~* 'select (public\.)?current_user_' then
      q := regexp_replace(q, fn, '(SELECT public.\2())', 'g');
    end if;
    if w is not null and w ~ fn and w !~* 'select (public\.)?current_user_' then
      w := regexp_replace(w, fn, '(SELECT public.\2())', 'g');
    end if;
    if q is not null and q ~ 'auth\.uid\(\)' and q !~* 'select auth\.uid\(\)' then
      q := regexp_replace(q, 'auth\.uid\(\)', '(SELECT auth.uid())', 'g');
    end if;
    if w is not null and w ~ 'auth\.uid\(\)' and w !~* 'select auth\.uid\(\)' then
      w := regexp_replace(w, 'auth\.uid\(\)', '(SELECT auth.uid())', 'g');
    end if;
    if q is distinct from p.qual or w is distinct from p.with_check then
      execute format(
        'alter policy %I on %I.%I%s%s',
        p.policyname, p.schemaname, p.tablename,
        case when q is not null then ' using (' || q || ')' else '' end,
        case when w is not null then ' with check (' || w || ')' else '' end
      );
    end if;
  end loop;
end $$;

-- 5. Musterkandidaten ------------------------------------------------------------------
-- Fiktive Personen (E-Mails @example.com, Telefonnummern aus dem Bereich für Filme).
-- Überstehen das Leeren der Live-Daten (scripts/live-bereinigen.ts) und zählen nicht in
-- den Dashboard-Kennzahlen. Mehrfach ausführbar (je E-Mail nur einmal).
insert into public.candidates (first_name, last_name, email, phone, status, source, berufsbild, plz, lat, lng, notes, tags, created_at, custom_fields)
select v.first_name, v.last_name, v.email, v.phone, 'vorqualifiziert', 'manual', v.berufsbild, v.plz, v.lat, v.lng, v.notes,
       array['Musterdatensatz'], now() - (v.days_ago || ' days')::interval, v.custom_fields::jsonb
from (values
  ('Laura', 'Schneider', 'laura.schneider@example.com', '+49 30 23125 101', 'steuerfachangestellte', '50667', 50.9375, 6.9603, 21,
   'Erfahrene Steuerfachangestellte mit Schwerpunkt Finanzbuchhaltung und Jahresabschlüsse für Einzelunternehmen und Personengesellschaften. Arbeitet sehr selbstständig und sucht mehr Verantwortung bei der Mandantenbetreuung.',
   '{"ausbildung":"Steuerfachangestellte (2017)","alter":"28","verfuegbar_ab":"3 Monate zum Monatsende","wechselgrund":"Wenig Entwicklungsmöglichkeiten, möchte eigene Mandate betreuen","erwartungen_neuer_ag":"2 Tage Homeoffice, Unterstützung bei der Fortbildung zur Steuerfachwirtin","bevorzugter_bereich":"Finanzbuchhaltung und Jahresabschluss","betreute_branchen":"Handwerk, Gastronomie, Ärzte","datev_erfahrung":"Ja, Kanzlei-Rechnungswesen und Unternehmen online","anzahl_ag_5_jahre":"1","aktuelle_steuerkanzlei":"Ja","kanzleigroesse":"ca. 12 Mitarbeitende","gehaltsvorstellung":"46.000 €","erreichbarkeit":"werktags ab 17 Uhr"}'),
  ('Jonas', 'Becker', 'jonas.becker@example.com', '+49 30 23125 102', 'steuerfachangestellte', '48143', 51.9607, 7.6261, 9,
   'Berufseinsteiger mit sehr gutem Ausbildungsabschluss. Kennt Lohn- und Finanzbuchhaltung aus der Ausbildungskanzlei und möchte sich in Richtung Jahresabschluss weiterentwickeln.',
   '{"ausbildung":"Steuerfachangestellter (2025, Note 1,7)","alter":"23","verfuegbar_ab":"4 Wochen zum Monatsende","wechselgrund":"Ausbildungskanzlei kann keine Weiterentwicklung im Abschlussbereich bieten","erwartungen_neuer_ag":"Strukturierte Einarbeitung, feste Ansprechperson","bevorzugter_bereich":"Finanzbuchhaltung","betreute_branchen":"Einzelhandel, Dienstleister","datev_erfahrung":"Ja, Grundkenntnisse","anzahl_ag_5_jahre":"1","aktuelle_steuerkanzlei":"Ja","kanzleigroesse":"ca. 8 Mitarbeitende","gehaltsvorstellung":"38.000 €"}'),
  ('Sabine', 'Hoffmann', 'sabine.hoffmann@example.com', '+49 30 23125 103', 'steuerfachangestellte', '60311', 50.1109, 8.6821, 34,
   'Langjährige Lohnspezialistin, betreut eigenständig rund 60 Mandanten in der Lohn- und Gehaltsabrechnung inklusive Baulohn. Sucht eine Teilzeitstelle mit festen Arbeitszeiten.',
   '{"ausbildung":"Steuerfachangestellte (2004)","alter":"41","verfuegbar_ab":"3 Monate zum Quartalsende","wechselgrund":"Kanzleiübergabe, möchte Teilzeit mit festen Tagen","erwartungen_neuer_ag":"30 Stunden an 4 Tagen, Homeoffice möglich","bevorzugter_bereich":"Lohn- und Gehaltsabrechnung","betreute_branchen":"Bau, Pflege, Gastronomie","datev_erfahrung":"Ja, LODAS und Lohn und Gehalt","anzahl_ag_5_jahre":"1","aktuelle_steuerkanzlei":"Ja","kanzleigroesse":"ca. 25 Mitarbeitende","gehaltsvorstellung":"44.000 € (Teilzeit 30 Std.)"}'),
  ('Katharina', 'Wagner', 'katharina.wagner@example.com', '+49 30 23125 104', 'steuerfachwirt', '40213', 51.2277, 6.7735, 14,
   'Steuerfachwirtin mit eigenständiger Erstellung von Jahresabschlüssen und Steuererklärungen für GmbHs und Personengesellschaften. Übernimmt gern die Betreuung von Auszubildenden.',
   '{"ausbildung":"Steuerfachangestellte (2013), Steuerfachwirtin (2021)","alter":"34","verfuegbar_ab":"3 Monate zum Quartalsende","wechselgrund":"Möchte in eine Kanzlei mit größeren Mandaten und klarer Aufstiegsperspektive","erwartungen_neuer_ag":"Perspektive Teamleitung, moderne digitale Arbeitsweise","bevorzugter_bereich":"Jahresabschluss und betriebliche Steuern","betreute_branchen":"Immobilien, IT, Großhandel","datev_erfahrung":"Ja, umfassend inkl. DMS","anzahl_ag_5_jahre":"2","aktuelle_steuerkanzlei":"Ja","kanzleigroesse":"ca. 30 Mitarbeitende","gehaltsvorstellung":"58.000 €"}'),
  ('Daniel', 'Fischer', 'daniel.fischer@example.com', '+49 30 23125 105', 'steuerfachwirt', '20095', 53.5511, 9.9937, 5,
   'Frisch geprüfter Steuerfachwirt mit breiter Erfahrung in der Mandantenbetreuung. Hat in seiner jetzigen Kanzlei die Umstellung auf Unternehmen online begleitet.',
   '{"ausbildung":"Steuerfachangestellter (2018), Steuerfachwirt (2024)","alter":"30","verfuegbar_ab":"2 Monate zum Monatsende","wechselgrund":"Nach der Fortbildung keine angepasste Position und Vergütung","erwartungen_neuer_ag":"Verantwortung für eigenen Mandantenstamm, Unterstützung beim Steuerberaterexamen","bevorzugter_bereich":"Steuererklärungen und Jahresabschluss","betreute_branchen":"Logistik, Medien, Freiberufler","datev_erfahrung":"Ja, umfassend","anzahl_ag_5_jahre":"1","aktuelle_steuerkanzlei":"Ja","kanzleigroesse":"ca. 18 Mitarbeitende","gehaltsvorstellung":"55.000 €"}'),
  ('Melanie', 'Krüger', 'melanie.krueger@example.com', '+49 30 23125 106', 'steuerfachwirt', '30159', 52.3759, 9.7320, 47,
   'Steuerfachwirtin mit Führungserfahrung: leitet derzeit ein Team von fünf Mitarbeitenden in der Buchhaltung. Sehr gute Kenntnisse in Lohn und Finanzbuchhaltung.',
   '{"ausbildung":"Steuerfachangestellte (2001), Steuerfachwirtin (2010)","alter":"45","verfuegbar_ab":"6 Monate zum Quartalsende","wechselgrund":"Umzug in die Region Hannover","erwartungen_neuer_ag":"Führungsrolle, Homeoffice an zwei Tagen","bevorzugter_bereich":"Teamleitung Buchhaltung","betreute_branchen":"Handwerk, Landwirtschaft, Ärzte","datev_erfahrung":"Ja, umfassend","anzahl_ag_5_jahre":"1","aktuelle_steuerkanzlei":"Ja","kanzleigroesse":"ca. 40 Mitarbeitende","gehaltsvorstellung":"65.000 €"}'),
  ('Thomas', 'Richter', 'thomas.richter@example.com', '+49 30 23125 107', 'bilanzbuchhalter', '80331', 48.1374, 11.5755, 26,
   'Geprüfter Bilanzbuchhalter mit Erfahrung in Konzernabschlüssen nach HGB und IFRS. Möchte aus der Industrie in eine Steuerkanzlei mit anspruchsvollen Mandaten wechseln.',
   '{"ausbildung":"Industriekaufmann, Bilanzbuchhalter IHK (2016)","alter":"38","verfuegbar_ab":"3 Monate zum Monatsende","wechselgrund":"Möchte vielseitigere Aufgaben als in der Konzernbuchhaltung","erwartungen_neuer_ag":"Anspruchsvolle Abschlüsse, flexible Arbeitszeiten","bevorzugter_bereich":"Jahres- und Konzernabschluss","betreute_branchen":"Industrie, Automotive","datev_erfahrung":"Grundkenntnisse, SAP sehr gut","anzahl_ag_5_jahre":"2","aktuelle_steuerkanzlei":"Nein","kanzleigroesse":"Industrieunternehmen, ca. 800 Mitarbeitende","gehaltsvorstellung":"68.000 €"}'),
  ('Nadine', 'Wolf', 'nadine.wolf@example.com', '+49 30 23125 108', 'bilanzbuchhalter', '70173', 48.7758, 9.1829, 11,
   'Bilanzbuchhalterin in einer mittelgroßen Kanzlei. Erstellt eigenständig Abschlüsse samt E-Bilanz und bereitet Betriebsprüfungen vor.',
   '{"ausbildung":"Steuerfachangestellte (2014), Bilanzbuchhalterin IHK (2022)","alter":"32","verfuegbar_ab":"3 Monate zum Monatsende","wechselgrund":"Lange Pendelstrecke, sucht Kanzlei in Stuttgart","erwartungen_neuer_ag":"Kurzer Arbeitsweg oder Homeoffice, 4-Tage-Woche möglich","bevorzugter_bereich":"Jahresabschluss","betreute_branchen":"Maschinenbau, Handel","datev_erfahrung":"Ja, umfassend","anzahl_ag_5_jahre":"1","aktuelle_steuerkanzlei":"Ja","kanzleigroesse":"ca. 22 Mitarbeitende","gehaltsvorstellung":"57.000 €"}'),
  ('Michael', 'Schulz', 'michael.schulz@example.com', '+49 30 23125 109', 'bilanzbuchhalter', '04109', 51.3397, 12.3731, 3,
   'Erfahrener Bilanzbuchhalter, zuletzt Leiter Rechnungswesen in einem Handelsunternehmen. Kurzfristig verfügbar und offen für eine Tätigkeit in einer Steuerkanzlei.',
   '{"ausbildung":"Bankkaufmann, Bilanzbuchhalter IHK (2002)","alter":"52","verfuegbar_ab":"Sofort (aktuell freigestellt)","wechselgrund":"Standortschließung des bisherigen Arbeitgebers","erwartungen_neuer_ag":"Unbefristete Stelle, wertschätzendes Team","bevorzugter_bereich":"Finanzbuchhaltung und Abschlüsse","betreute_branchen":"Großhandel, Immobilien","datev_erfahrung":"Ja, DATEV und SAP","anzahl_ag_5_jahre":"1","aktuelle_steuerkanzlei":"Nein","kanzleigroesse":"Handelsunternehmen, ca. 150 Mitarbeitende","gehaltsvorstellung":"54.000 €"}'),
  ('Anna', 'Lehmann', 'anna.lehmann@example.com', '+49 30 23125 110', 'steuerberater', '10117', 52.5200, 13.4050, 19,
   'Steuerberaterin mit Schwerpunkt Unternehmenssteuerrecht und Umsatzsteuer. Begleitet regelmäßig Betriebsprüfungen und betreut mittelständische Unternehmen eigenständig.',
   '{"ausbildung":"Studium BWL, Steuerberaterin (2019)","alter":"39","verfuegbar_ab":"6 Monate zum Quartalsende","wechselgrund":"Wunsch nach Partnerschaftsperspektive","erwartungen_neuer_ag":"Partnerperspektive, eigenes Team","bevorzugter_bereich":"Unternehmenssteuern, Betriebsprüfung","betreute_branchen":"Mittelstand, Start-ups, Immobilien","datev_erfahrung":"Ja, umfassend","anzahl_ag_5_jahre":"1","aktuelle_steuerkanzlei":"Ja","kanzleigroesse":"ca. 45 Mitarbeitende","gehaltsvorstellung":"95.000 €"}'),
  ('Christian', 'Braun', 'christian.braun@example.com', '+49 30 23125 111', 'steuerberater', '53111', 50.7374, 7.0982, 8,
   'Frisch bestellter Steuerberater mit mehrjähriger Erfahrung als Steuerfachwirt. Sucht eine Kanzlei, in der er schrittweise eigene Mandate übernehmen kann.',
   '{"ausbildung":"Steuerfachangestellter, Steuerfachwirt, Steuerberater (2024)","alter":"34","verfuegbar_ab":"3 Monate zum Monatsende","wechselgrund":"Bisherige Kanzlei bietet nach dem Examen keine Berufsträgerposition","erwartungen_neuer_ag":"Berufsträgerposition, Homeoffice an 2 Tagen","bevorzugter_bereich":"Einkommensteuer und Personengesellschaften","betreute_branchen":"Freiberufler, Ärzte, Handwerk","datev_erfahrung":"Ja, umfassend","anzahl_ag_5_jahre":"1","aktuelle_steuerkanzlei":"Ja","kanzleigroesse":"ca. 15 Mitarbeitende","gehaltsvorstellung":"80.000 €"}'),
  ('Petra', 'Zimmermann', 'petra.zimmermann@example.com', '+49 30 23125 112', 'steuerberater', '90402', 49.4521, 11.0767, 40,
   'Steuerberaterin mit über 15 Jahren Berufserfahrung, spezialisiert auf vermögende Privatpersonen, Erbschaft- und Schenkungsteuer sowie Unternehmensnachfolge.',
   '{"ausbildung":"Studium Wirtschaftsrecht, Steuerberaterin (2009)","alter":"48","verfuegbar_ab":"6 Monate zum Quartalsende","wechselgrund":"Neuausrichtung der jetzigen Kanzlei","erwartungen_neuer_ag":"Spezialisierte Beratung, Teilzeit 80 % möglich","bevorzugter_bereich":"Erbschaft- und Schenkungsteuer, Nachfolgeplanung","betreute_branchen":"Vermögende Privatpersonen, Familienunternehmen","datev_erfahrung":"Ja, umfassend","anzahl_ag_5_jahre":"1","aktuelle_steuerkanzlei":"Ja","kanzleigroesse":"ca. 60 Mitarbeitende","gehaltsvorstellung":"110.000 €"}')
) as v(first_name, last_name, email, phone, berufsbild, plz, lat, lng, days_ago, notes, custom_fields)
where not exists (select 1 from public.candidates c where c.email = v.email);

analyze;
