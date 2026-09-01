-- Kanzlei-Zuordnungs-Funktion mit Status-Pipeline (analog zur externen "Stecktafel",
-- siehe stecktafel-daten.json-Abgleich vom 31.08.2026): ordnet einen Kandidaten einer
-- Kanzlei zu und verfolgt den Status durch den Vermittlungsprozess. Status-Werte
-- entsprechen den dort beobachteten Spalten: inbox (Neue Leads), vq (Vorqualifiziert),
-- vqk (Vorqualifiziert beim Kunden), vg (Vorstellungsgespräch), ja, nein.
--
-- removed_at statt Hard-Delete, damit die Historie (wer war wann bei welcher Kanzlei)
-- erhalten bleibt, auch nachdem eine Zuordnung beendet wurde. Der UNIQUE PARTIAL INDEX
-- erzwingt "nur eine aktive Zuordnung pro Kandidat gleichzeitig" auf DB-Ebene, nicht nur
-- im UI - ein zweiter INSERT für denselben Kandidaten schlägt fehl, solange die erste
-- Zuordnung nicht per removed_at beendet wurde.
--
-- ON DELETE CASCADE für candidate_id/client_id (beide NOT NULL) - gleiches Muster wie
-- candidate_campaign_matches/client_contacts: wird ein Kandidat oder Kunde endgültig
-- gelöscht, verschwindet die Zuordnung mit. created_by ist nullable -> ON DELETE SET
-- NULL, analog zu allen anderen optionalen profiles-Referenzen.
--
-- RLS/Grants bewusst nach demselben einfachen Muster wie tasks/leadtable_sync_runs/
-- locations (keine Agentur-Scoping-Subquery) - GRANTs diesmal direkt mit in dieser
-- Migration (siehe 20260901000003_add_tasks.sql).
CREATE TABLE client_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'inbox' CHECK (status IN ('inbox', 'vq', 'vqk', 'vg', 'ja', 'nein')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  removed_at timestamptz
);

-- Erzwingt die "nur eine Kanzlei gleichzeitig"-Regel auf DB-Ebene.
CREATE UNIQUE INDEX idx_client_assignments_one_active_per_candidate
ON client_assignments (candidate_id)
WHERE removed_at IS NULL;

CREATE INDEX idx_client_assignments_client_id ON client_assignments (client_id);

ALTER TABLE client_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can access client assignments"
ON client_assignments FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_assignments TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
