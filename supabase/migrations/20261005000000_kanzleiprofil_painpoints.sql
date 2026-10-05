-- Paket 10 (05.10.2026): Kanzleiprofil um Vertriebs-Erkenntnisse aus den
-- Gesprächstranskripten ergänzen (über Zapier-AI aus Close). Nur intern - diese
-- Angaben gehen nicht in die Stellenanzeige auf Kanzleistelle24.
alter table public.client_profiles
  add column if not exists painpoints text,
  add column if not exists ziele_zusammenarbeit text;

notify pgrst, 'reload schema';
