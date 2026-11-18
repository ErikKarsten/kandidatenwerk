-- Paket 107 (18.11.2026): Wer einen Fehler gemeldet oder sich etwas gewünscht hat, bekommt
-- eine Mail, sobald die Meldung erledigt ist (Aufgabe abgehakt oder "Als erledigt markieren").
--
-- resolved_mail_at: wann diese Mail verschickt wurde (bzw. bewusst keine nötig war, z.B.
--   weil der Melder sie selbst erledigt hat). Höchstens eine Mail pro Meldung, auch wenn
--   die Aufgabe wieder geöffnet und erneut abgehakt wird.
-- Bereits erledigte Meldungen gelten als benachrichtigt - sonst bekäme ein Melder für eine
-- alte Meldung eine Mail, sobald jemand die Aufgabe zufällig neu öffnet und abhakt.

alter table public.bug_reports add column if not exists resolved_mail_at timestamptz;

update public.bug_reports set resolved_mail_at = now() where status = 'erledigt' and resolved_mail_at is null;

NOTIFY pgrst, 'reload schema';
