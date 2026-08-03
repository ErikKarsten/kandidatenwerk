-- Protokoll-Tabelle für den automatischen Leadtable-Sync (Grundlage für Live-Status-
-- Anzeige, z.B. "letzter Lauf: vor 5 Minuten, erfolgreich"). Rein interne Betriebsinfo,
-- keine kundenspezifischen Daten - deshalb bewusst einfacheres RLS-Muster als bei
-- candidate_campaign_matches (keine Agentur-Scoping-Subquery nötig).
CREATE TABLE leadtable_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'success', 'failed')),
  summary jsonb,
  error_message text
);

ALTER TABLE leadtable_sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can access leadtable sync runs"
ON leadtable_sync_runs FOR ALL TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
