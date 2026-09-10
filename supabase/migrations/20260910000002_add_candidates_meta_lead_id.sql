-- Speichert die einzelne Meta-Lead-ID (Graph-API-Leadgen-ID) pro Kandidat, analog zu
-- leadtable_lead_id (siehe 20260804000000_add_candidates_leadtable_lead_id.sql). Wird
-- vom Meta-Leads-Sync (scripts/meta-leads-sync.ts) zur Dublettenprüfung genutzt -
-- zusätzlich zur bestehenden E-Mail-Prüfung, damit ein Lead auch dann nicht doppelt
-- importiert wird, wenn er (z.B. während der Parallelphase mit Leadtable) unter leicht
-- abweichender E-Mail nochmal ankommt.
alter table public.candidates
  add column meta_lead_id text unique;
