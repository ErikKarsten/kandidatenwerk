-- Repariert offene RLS-Policies auf candidates, campaigns und clients.
--
-- Bisheriger Zustand: Auf allen drei Tabellen existieren neben den korrekt
-- auf die eigene Agentur eingeschraenkten Policies zusaetzlich Policies mit
-- USING (true) (campaigns: "agency_admin_campaigns", "auth_delete",
-- "authenticated_read_campaigns"; candidates: "agency_admin_candidates";
-- clients: komplett ohne Agentur-Policy, nur offene). Da Postgres
-- permissive Policies mit OR verknuepft, macht schon eine offene Policy
-- die eingeschraenkte danaben wirkungslos.
--
-- Diese Migration:
-- 1. legt fuer clients die fehlende Agentur-Policy an (analog zu campaigns)
-- 2. entfernt alle offenen Policies auf allen drei Tabellen
-- 3. stellt sicher, dass RLS auf allen drei Tabellen aktiv ist

-- 1) clients: fehlende Agentur-Policy ergaenzen
create policy "Clients der eigenen Agentur"
on public.clients
for all
to authenticated
using (
  agency_id = (select profiles.agency_id from public.profiles where profiles.id = auth.uid())
)
with check (
  agency_id = (select profiles.agency_id from public.profiles where profiles.id = auth.uid())
);

-- 2) offene Policies entfernen
drop policy if exists "auth_delete" on public.clients;
drop policy if exists "authenticated_insert_clients" on public.clients;
drop policy if exists "authenticated_read_clients" on public.clients;
drop policy if exists "authenticated_update_clients" on public.clients;

drop policy if exists "agency_admin_campaigns" on public.campaigns;
drop policy if exists "auth_delete" on public.campaigns;
drop policy if exists "authenticated_read_campaigns" on public.campaigns;

drop policy if exists "agency_admin_candidates" on public.candidates;

-- 3) Sicherstellen, dass RLS aktiv ist (idempotent, kein Fehler falls schon an)
alter table public.clients enable row level security;
alter table public.campaigns enable row level security;
alter table public.candidates enable row level security;
