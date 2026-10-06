-- Paket 16 (06.10.2026), T-52: Kunde und Stellen aus dem Kanzleiprofil zu Kanzleistelle24.
-- Jede gesuchte Stelle wird eine Stellenanzeige (kanzleistelle_job_id). Nach dem ersten
-- Veröffentlichen per Knopf werden Änderungen automatisch übertragen; Stand und letzter
-- Fehler stehen am Kunden.
alter table public.client_positions
  add column if not exists kanzleistelle_job_id uuid;

alter table public.clients
  add column if not exists kanzleistelle_synced_at timestamptz,
  add column if not exists kanzleistelle_sync_error text;

notify pgrst, 'reload schema';
