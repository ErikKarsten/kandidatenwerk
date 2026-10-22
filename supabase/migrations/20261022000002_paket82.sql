-- Paket 82: Prüfsumme der Angaben, aus denen der Werdegang für den Lebenslauf entstand.
-- Ändern sich Beschreibung oder Zusatzfelder, erstellt die Lebenslauf-Ansicht ihn neu.
alter table public.candidates
  add column if not exists cv_werdegang_input text;

NOTIFY pgrst, 'reload schema';
