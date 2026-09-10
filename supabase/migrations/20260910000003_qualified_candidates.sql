-- Neue, eigene Tabelle für den kuratierten "Qualifizierte Kandidaten"-Pool (separat
-- vom Leadtable-Rohimport, siehe Aufgabenliste). Hält NUR eine Verknüpfung zum
-- bestehenden Kandidaten (keine Datenduplizierung) - die eigentlichen Profildaten
-- bleiben allein in candidates. Wird automatisch befüllt/bereinigt durch
-- scripts/refresh-qualified-candidates.ts (siehe src/lib/qualified-candidates.ts für
-- die Aufnahme-Kriterien), nicht manuell gepflegt.
create table public.qualified_candidates (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null unique references public.candidates(id) on delete cascade,
  added_at timestamptz not null default now(),
  -- Kurzer Klartext, welche Kriterien zur Aufnahme geführt haben (fürs Nachvollziehen/
  -- Debugging in der UI, kein strukturiertes Feld nötig).
  criteria_reason text
);

alter table public.qualified_candidates enable row level security;

-- Gleiches Scoping-Muster wie "Candidates der eigenen Agentur" (siehe
-- 20260907000000_fix_open_rls_policies.sql / 20260907000003_..._backfill_agency.sql):
-- ein qualifizierter Kandidat ist nur für Staff der Agentur sichtbar, zu der er über
-- campaign_id ODER (Stecktafel-Fall) direkt über client_id gehört. Kein separater
-- Policy-Pfad für die Portal-Kunden vorgesehen - dieser Pool ist reine interne Übersicht.
create policy "Qualifizierte Kandidaten der eigenen Agentur"
on public.qualified_candidates
for all
to authenticated
using (
  candidate_id in (
    select candidates.id from public.candidates
    where candidates.campaign_id in (
      select campaigns.id from public.campaigns
      where campaigns.client_id in (
        select clients.id from public.clients
        where clients.agency_id = public.current_user_agency_id()
      )
    )
    or candidates.client_id in (
      select clients.id from public.clients
      where clients.agency_id = public.current_user_agency_id()
    )
  )
);

NOTIFY pgrst, 'reload schema';
