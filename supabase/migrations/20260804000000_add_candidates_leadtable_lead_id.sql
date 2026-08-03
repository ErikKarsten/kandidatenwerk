-- Speichert die einzelne Leadtable-Lead-ID (MongoDB ObjectId, kein UUID) pro Kandidat.
-- Bisher wurde jeder Sync per E-Mail-Suche (searchLeadByMail) durchgeführt, was zu
-- ca. 25-30% 404-Ausfällen führt (Leads mit geänderter/gelöschter E-Mail). Mit der
-- gespeicherten Lead-ID kann künftig direkt per GET /lead/{id} abgefragt werden -
-- zuverlässiger für Status-Sync und den geplanten Beschreibungs-Import.
alter table public.candidates
  add column leadtable_lead_id text unique;
