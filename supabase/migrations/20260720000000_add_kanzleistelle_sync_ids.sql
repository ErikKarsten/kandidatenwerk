-- Grundlage für den Sync zwischen Kandidatenwerk und Kanzleistelle24.
-- UNIQUE stellt sicher, dass nie zwei Kandidatenwerk-Datensätze auf denselben
-- Kanzleistelle24-Datensatz zeigen (verhindert Duplikate beim Sync).

alter table public.candidates
  add column kanzleistelle_application_id uuid unique;

alter table public.clients
  add column kanzleistelle_company_id uuid unique;

alter table public.campaigns
  add column kanzleistelle_job_id uuid unique;
