-- Umbau des Zusatzfelder-Systems von fest-codiert (FIXED_CUSTOM_FIELDS in
-- candidate-custom-fields.ts) auf agenturweit gepflegte, DB-gestützte Feldliste.
-- Schritt 1 von mehreren (siehe Anfrage vom 25.09.2026): reine DB-Struktur + Migration.
-- UI (Verwaltung, Anzeige, Kopier-Buttons) und Extraktionslogik (Leadtable/Meta) folgen
-- in separaten Schritten, sobald diese Struktur abgestimmt/angewendet ist.

-- ============================================================
-- 0) Neue Hilfsfunktion current_user_is_agency_admin(), analog zu
--    current_user_is_staff() (siehe 20260923000000) - SECURITY DEFINER, fragt
--    profiles OHNE RLS ab. Für Schreibrechte auf die Feldverwaltung: nur
--    agency_admin, nicht agency_member (siehe Anforderung Punkt 4).
-- ============================================================
create or replace function public.current_user_is_agency_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select role = 'agency_admin' from public.profiles where id = auth.uid()
$$;

grant execute on function public.current_user_is_agency_admin() to authenticated;

-- ============================================================
-- 1) custom_field_definitions - ersetzt FIXED_CUSTOM_FIELDS als einzige Quelle für
--    UI-Anzeige UND KI-Extraktion. "key" bleibt nach Anlage stabil (wird in
--    candidates.custom_fields als JSON-Schlüssel verwendet, siehe bestehende Werte
--    wie "ausbildung", "verfuegbar_ab"); "label" ist das änderbare Anzeige-Label.
--    "active = false" ist das "Löschen" aus Anforderung Punkt 5 - rein logisch, keine
--    physische Löschung, bereits gespeicherte Kandidaten-Werte unter dem Key bleiben
--    unangetastet und werden bei Reaktivierung wieder normal angezeigt.
-- ============================================================
create table public.custom_field_definitions (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  key text not null,
  label text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agency_id, key)
);

alter table public.custom_field_definitions enable row level security;

-- Lesen: gesamtes Team der eigenen Agentur (für Profil-Anzeige und Extraktion nötig).
create policy "Team liest Zusatzfeld-Definitionen der eigenen Agentur"
on public.custom_field_definitions
for select
to authenticated
using (
  agency_id = public.current_user_agency_id()
  and public.current_user_is_staff()
);

-- Schreiben (Anlegen/Umbenennen/(De-)Aktivieren): nur agency_admin, siehe Punkt 4.
create policy "Agency-Admin verwaltet Zusatzfeld-Definitionen der eigenen Agentur"
on public.custom_field_definitions
for all
to authenticated
using (
  agency_id = public.current_user_agency_id()
  and public.current_user_is_agency_admin()
)
with check (
  agency_id = public.current_user_agency_id()
  and public.current_user_is_agency_admin()
);

grant select, insert, update, delete on public.custom_field_definitions to authenticated, service_role;

create index custom_field_definitions_agency_active_idx
  on public.custom_field_definitions (agency_id, active, sort_order);

-- ============================================================
-- 2) custom_field_review_queue - Punkt 3: unbekannte Leadtable-Antwortschlüssel, die
--    die KI-Extraktion keinem bestehenden Feld zuordnen konnte, NICHT automatisch als
--    neues Feld anlegen, sondern hier zur manuellen Prüfung sammeln. Ein Eintrag pro
--    (agency_id, raw_key) statt pro Vorkommen - dieselbe Leadtable-Formularfrage taucht
--    sonst bei jedem neuen Lead erneut auf und würde die Tabelle sofort aufblähen.
-- ============================================================
create table public.custom_field_review_queue (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  raw_key text not null,
  example_value text,
  example_candidate_id uuid references public.candidates(id) on delete set null,
  occurrences integer not null default 1,
  status text not null default 'pending' check (status in ('pending', 'dismissed', 'mapped')),
  mapped_to_field_id uuid references public.custom_field_definitions(id) on delete set null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id),
  unique (agency_id, raw_key)
);

alter table public.custom_field_review_queue enable row level security;

create policy "Team liest Zusatzfeld-Prüfliste der eigenen Agentur"
on public.custom_field_review_queue
for select
to authenticated
using (
  agency_id = public.current_user_agency_id()
  and public.current_user_is_staff()
);

create policy "Agency-Admin bearbeitet Zusatzfeld-Prüfliste der eigenen Agentur"
on public.custom_field_review_queue
for update
to authenticated
using (
  agency_id = public.current_user_agency_id()
  and public.current_user_is_agency_admin()
)
with check (
  agency_id = public.current_user_agency_id()
  and public.current_user_is_agency_admin()
);

-- Insert/Upsert beim Extraktions-Lauf passiert über den Service-Role-Client
-- (Sync-Skripte laufen ohne eingeloggte Nutzer-Session, siehe leadtable-import.ts) -
-- keine "insert"-Policy für authenticated nötig.
grant select, update on public.custom_field_review_queue to authenticated;
grant select, insert, update, delete on public.custom_field_review_queue to service_role;

create index custom_field_review_queue_agency_status_idx
  on public.custom_field_review_queue (agency_id, status);

-- ============================================================
-- 3) Bestehende 12 Felder (aus candidate-custom-fields.ts) + neues Feld
--    "Wohnort (PLZ)" (Punkt 1) für jede vorhandene Agentur seeden - bewusst
--    zusätzlich/parallel zum Stammdaten-PLZ-Feld auf candidates.plz, keine
--    Zusammenlegung (siehe Anforderung).
-- ============================================================
insert into public.custom_field_definitions (agency_id, key, label, sort_order, active)
select a.id, f.key, f.label, f.sort_order, true
from public.agencies a
cross join (values
  ('ausbildung', 'Ausbildung', 0),
  ('erreichbarkeit', 'Erreichbarkeit', 1),
  ('verfuegbar_ab', 'Startdatum', 2),
  ('wechselgrund', 'Wechselgrund', 3),
  ('erwartungen_neuer_ag', 'Erwartungen neuer AG', 4),
  ('bevorzugter_bereich', 'Welchen Bereich machst du am liebsten', 5),
  ('anzahl_ag_5_jahre', 'Wie viele AG in den letzten 5 Jahren', 6),
  ('aktuelle_steuerkanzlei', 'Aktuell Steuerkanzlei', 7),
  ('kanzleigroesse', 'Wie groß ist diese', 8),
  ('betreute_branchen', 'Welche Branchen werden betreut', 9),
  ('datev_erfahrung', 'Erfahrung mit DATEV (offen dafür)', 10),
  ('alter', 'Alter', 11),
  ('wohnort_plz', 'Wohnort (PLZ)', 12)
) as f(key, label, sort_order)
on conflict (agency_id, key) do nothing;

NOTIFY pgrst, 'reload schema';
