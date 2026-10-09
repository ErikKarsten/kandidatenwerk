-- Paket 43: Werdegang für den Lebenslauf (Stationen der letzten zehn Jahre mit Aufgaben).
-- Vom Team erfasst oder per KI aus den Kandidatenangaben ausformuliert und um typische
-- Aufgaben des Berufsbilds angereichert; im Kandidatenprofil editierbar.
alter table public.candidates add column if not exists cv_werdegang text;
