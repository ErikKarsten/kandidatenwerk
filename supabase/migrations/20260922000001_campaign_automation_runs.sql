-- Dedup-/Protokoll-Tabelle für das Automatisierungs-Ausführungssystem
-- (scripts/run-automations.ts) - eine Zeile pro tatsächlich ausgelöster
-- Automatisierung/Kandidat-Kombination, verhindert, dass eine Automatisierung für
-- denselben Kandidaten mehrfach feuert (z.B. bei jedem Cron-Lauf neu geprüft, oder
-- wenn der Kandidat später erneut in denselben Status wechselt).
-- Kein UI-Zugriff vorgesehen - RLS ist aktiviert, aber bewusst ohne Policies,
-- damit nur der Service-Role-Key (der RLS umgeht) schreiben/lesen kann.
CREATE TABLE campaign_automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES campaign_automations(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  fired_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (automation_id, candidate_id)
);

ALTER TABLE campaign_automation_runs ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
