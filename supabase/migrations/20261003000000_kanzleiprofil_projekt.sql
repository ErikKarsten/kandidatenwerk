-- Paket 9 (03.10.2026): Projekt-Reiter beim Kunden als Ersatz für ClickUp -
-- Kanzleiprofil, Projektphase/Vertrag, gesuchte Stellen und Kommentare. Nur das Team
-- (agency_admin/agency_member) hat Zugriff, Portal-Kunden nie.

-- 1. Projekt-Daten direkt am Kunden
alter table public.clients
  add column if not exists project_phase text not null default 'onboarding'
    check (project_phase in ('onboarding', 'kampagne_vorbereitung', 'live', 'pausiert', 'gekuendigt')),
  add column if not exists contract_start date,
  add column if not exists contract_term_months integer check (contract_term_months is null or contract_term_months > 0),
  add column if not exists key_account_manager_id uuid references public.profiles(id) on delete set null,
  -- Verknüpfung zu Close (Paket 10, Webhook über Zapier): Lead-ID, Link zum Profil und
  -- letzter übertragener Status ("Folgebesprechung zum SC vereinbart" oder "Gewonnen").
  add column if not exists close_lead_id text unique,
  add column if not exists close_url text,
  add column if not exists close_status text,
  add column if not exists close_status_at timestamptz;

-- 2. Kanzleiprofil (1:1 zum Kunden)
create table public.client_profiles (
  client_id uuid primary key references public.clients(id) on delete cascade,
  kurzbeschreibung text,
  intro text,
  website text,
  mitarbeiterzahl text,
  standorte text,
  mandantenstruktur text,
  software text,
  arbeitszeiten text,
  homeoffice text,
  benefits text[] not null default '{}',
  ansprechpartner_bewerbung text,
  vertriebsnotizen text,
  -- Vom Key Account Manager abgeschlossen (vor dem Willkommensmeeting).
  finalized_at timestamptz,
  finalized_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

-- 3. Gesuchte Stellen je Kunde; eine Kampagne kann mehrere Stellen bündeln.
create table public.client_positions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  title text not null,
  berufsbild text,
  plz text,
  ort text,
  lat double precision,
  lng double precision,
  radius_km integer,
  arbeitszeit text,
  berufserfahrung text,
  software text,
  gehalt text,
  startdatum text,
  anforderungen text,
  aufgaben text,
  campaign_id uuid references public.campaigns(id) on delete set null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index client_positions_client_idx on public.client_positions (client_id);

-- 4. Kommentare (Notiz, Termin, Telefonat, E-Mail) mit Erwähnungen; Anhänge liegen in
--    client_files (comment_id).
create table public.client_comments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  kind text not null default 'notiz' check (kind in ('notiz', 'termin', 'telefonat', 'email', 'system')),
  content text not null,
  mentions uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  edited_at timestamptz
);
create index client_comments_client_idx on public.client_comments (client_id, created_at desc);

alter table public.client_files
  add column if not exists comment_id uuid references public.client_comments(id) on delete cascade;

-- RLS: nur Team, nur Kunden der eigenen Agentur (über die clients-Policies).
alter table public.client_profiles enable row level security;
alter table public.client_positions enable row level security;
alter table public.client_comments enable row level security;

create policy "Team verwaltet Kanzleiprofile"
on public.client_profiles for all to authenticated
using (public.current_user_is_staff() and client_id in (select id from public.clients))
with check (public.current_user_is_staff() and client_id in (select id from public.clients));

create policy "Team verwaltet gesuchte Stellen"
on public.client_positions for all to authenticated
using (public.current_user_is_staff() and client_id in (select id from public.clients))
with check (public.current_user_is_staff() and client_id in (select id from public.clients));

create policy "Team liest Kommentare"
on public.client_comments for select to authenticated
using (public.current_user_is_staff() and client_id in (select id from public.clients));

create policy "Team schreibt eigene Kommentare"
on public.client_comments for insert to authenticated
with check (public.current_user_is_staff() and author_id = auth.uid() and client_id in (select id from public.clients));

-- Bearbeiten/Löschen: eigene Kommentare, Admins alle.
create policy "Team bearbeitet eigene Kommentare"
on public.client_comments for update to authenticated
using (public.current_user_is_staff() and (author_id = auth.uid() or public.current_user_is_agency_admin()))
with check (public.current_user_is_staff() and (author_id = auth.uid() or public.current_user_is_agency_admin()));

create policy "Team löscht eigene Kommentare"
on public.client_comments for delete to authenticated
using (public.current_user_is_staff() and (author_id = auth.uid() or public.current_user_is_agency_admin()));

grant select, insert, update, delete on public.client_profiles, public.client_positions, public.client_comments to authenticated, service_role;

notify pgrst, 'reload schema';
