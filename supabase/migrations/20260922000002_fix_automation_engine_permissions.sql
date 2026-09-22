-- Behebt zwei Bugs, die beim End-to-End-Test der Automation Engine
-- (scripts/run-automations.ts) am 22.09.2026 auffielen: der Mailversand klappt,
-- aber beide Protokoll-Schritte danach schlagen fehl - unbemerkt, weil das Script
-- die Fehler der beiden Inserts nicht prüft. Effekt: kein Dedup-Eintrag, d.h. eine
-- Automatisierung würde bei jedem erneuten Lauf (auch dem 5-Minuten-Cron) erneut an
-- denselben Kandidaten senden, und der Verlaufs-Eintrag "Automatisierung ... ausgelöst"
-- erscheint nie beim Kandidaten.

-- 1) campaign_automation_runs (siehe 20260922000001_campaign_automation_runs.sql):
-- RLS ist aktiviert, aber der Kommentar dort ging fälschlich davon aus, der
-- Service-Role-Key umgehe damit automatisch auch die Tabellen-Rechte - RLS-Bypass und
-- GRANT sind aber zwei getrennte Mechanismen. Ohne GRANT bekommt service_role
-- "permission denied for table campaign_automation_runs".
GRANT SELECT, INSERT ON public.campaign_automation_runs TO authenticated, service_role;

-- 2) candidate_history_type_check erlaubt "automation" (Typ aus
-- scripts/run-automations.ts) noch nicht. Die bestehende Constraint-Definition wird
-- bewusst zur Laufzeit ausgelesen und nur um den fehlenden Wert ergänzt, statt sie
-- hier hart neu aufzuzählen - falls es bereits weitere erlaubte Werte gibt, die im
-- App-Code aktuell nicht vorkommen (z.B. historisch), bleiben die erhalten.
DO $$
DECLARE
  existing_def text;
  new_def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO existing_def
  FROM pg_constraint
  WHERE conname = 'candidate_history_type_check'
    AND conrelid = 'public.candidate_history'::regclass;

  IF existing_def IS NULL THEN
    RAISE EXCEPTION 'candidate_history_type_check nicht gefunden - Migration abgebrochen, bitte Constraint-Namen prüfen.';
  END IF;

  IF existing_def LIKE '%''automation''%' THEN
    RAISE NOTICE 'candidate_history_type_check erlaubt "automation" bereits, keine Änderung nötig.';
    RETURN;
  END IF;

  -- pg_get_constraintdef liefert für ein ursprüngliches "type IN (...)" die normalisierte
  -- Form "CHECK ((type = ANY (ARRAY['note'::text, 'status_change'::text])))" - 'automation'
  -- wird vor der schließenden ARRAY-Klammer eingefügt.
  IF existing_def !~ '\]\)\)?\)?$' THEN
    RAISE EXCEPTION 'Unerwartetes Format von candidate_history_type_check ("%"") - Migration abgebrochen, bitte manuell anpassen.', existing_def;
  END IF;

  new_def := regexp_replace(existing_def, '\]', ', ''automation''::text]', 1, 1);

  EXECUTE 'ALTER TABLE public.candidate_history DROP CONSTRAINT candidate_history_type_check';
  EXECUTE 'ALTER TABLE public.candidate_history ADD CONSTRAINT candidate_history_type_check ' || new_def;
END $$;

NOTIFY pgrst, 'reload schema';
