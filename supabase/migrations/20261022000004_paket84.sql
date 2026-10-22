-- Paket 84: Versandprotokoll je Automatisierung (Reiter "Automatisierungen" einer Kampagne:
-- Anzahl, Liste der gesendeten Mails, erneut senden). Ältere Einträge haben keinen Status -
-- die Liste liest deren Empfänger aus dem Verlauf des Kandidaten.
alter table public.campaign_automation_runs
  add column if not exists status text,
  add column if not exists recipients text[] not null default '{}',
  add column if not exists last_sent_at timestamptz,
  add column if not exists send_count integer not null default 0;

NOTIFY pgrst, 'reload schema';
