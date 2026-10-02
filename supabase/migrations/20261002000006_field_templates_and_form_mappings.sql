-- Paket 8 (02.10.2026): Feld-Vorlagen, Stammdaten-Zusatzfelder und Zuordnung der
-- Meta-Lead-Formularfragen zu Kandidatenfeldern.
--
-- 1. custom_field_definitions.section: eigene Felder können in den Stammdaten statt bei
--    den Zusatzfeldern stehen (Werte weiterhin in candidates.custom_fields).
-- 2. field_templates: mehrere Vorlagen, welche Zusatzfelder (und in welcher Reihenfolge)
--    angezeigt werden; Auswahl je Kanzlei-Kampagne (campaigns.field_template_id).
-- 3. meta_lead_forms: alle genutzten Meta-Lead-Formulare mit ihren Fragen und der
--    Zuordnung je Frage (questions[].target), gepflegt in Einstellungen -> Lead-Formulare.

alter table public.custom_field_definitions
  add column if not exists section text not null default 'zusatz'
  check (section in ('stammdaten', 'zusatz'));

create table public.field_templates (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  name text not null,
  field_keys text[] not null default '{}',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Höchstens eine Standardvorlage je Agentur.
create unique index field_templates_one_default_per_agency
  on public.field_templates (agency_id) where is_default;

alter table public.field_templates enable row level security;

create policy "Team liest Feld-Vorlagen der eigenen Agentur"
on public.field_templates
for select
to authenticated
using (agency_id = public.current_user_agency_id() and public.current_user_is_staff());

create policy "Agency-Admin verwaltet Feld-Vorlagen der eigenen Agentur"
on public.field_templates
for all
to authenticated
using (agency_id = public.current_user_agency_id() and public.current_user_is_agency_admin())
with check (agency_id = public.current_user_agency_id() and public.current_user_is_agency_admin());

grant select, insert, update, delete on public.field_templates to authenticated, service_role;

alter table public.campaigns
  add column if not exists field_template_id uuid references public.field_templates(id) on delete set null;

create table public.meta_lead_forms (
  form_id text primary key,
  agency_id uuid not null references public.agencies(id) on delete cascade,
  name text,
  page_name text,
  -- [{ key, label, type, target }] - target: first_name | last_name | full_name | email |
  -- phone | plz | berufsbild | field:<key> | beschreibung | ignorieren
  questions jsonb not null default '[]',
  -- Zeitpunkt, zu dem ein Mensch die Zuordnung zuletzt gespeichert hat (null = nur
  -- automatische Vorschläge).
  reviewed_at timestamptz,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.meta_lead_forms enable row level security;

create policy "Team liest Lead-Formulare der eigenen Agentur"
on public.meta_lead_forms
for select
to authenticated
using (agency_id = public.current_user_agency_id() and public.current_user_is_staff());

create policy "Agency-Admin bearbeitet Lead-Formulare der eigenen Agentur"
on public.meta_lead_forms
for update
to authenticated
using (agency_id = public.current_user_agency_id() and public.current_user_is_agency_admin())
with check (agency_id = public.current_user_agency_id() and public.current_user_is_agency_admin());

grant select, update on public.meta_lead_forms to authenticated;
grant select, insert, update, delete on public.meta_lead_forms to service_role;

notify pgrst, 'reload schema';
