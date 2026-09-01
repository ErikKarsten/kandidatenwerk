-- Grundlage für das Aufgaben-Feature: einfache To-Dos, optional an einen Kandidaten
-- gekoppelt (z.B. "Lebenslauf nachfordern"). candidate_id ist nullable und ON DELETE
-- SET NULL - eine Aufgabe soll nicht mitgelöscht werden, nur weil der Kandidat später
-- gelöscht wird (gleiches Muster wie candidates.campaign_id, siehe
-- 20260608000000_add_campaign_id_to_candidates.sql). assigned_to/created_by sind
-- bewusst ohne ON DELETE-Regel (Standard-Verhalten "kein Löschen bei bestehenden
-- Referenzen") - profiles werden aktuell nirgends im Code gelöscht, das soll auch so
-- bleiben, statt beim Entfernen eines Teammitglieds still dessen Aufgaben zu verlieren.
--
-- RLS bewusst einfaches "FOR ALL TO authenticated"-Muster wie bei leadtable_sync_runs/
-- locations (keine Agentur-Scoping-Subquery) - rein interne Aufgabenverwaltung, keine
-- kundenspezifischen Daten. GRANTs diesmal direkt mit in dieser Migration (wurden bei
-- leadtable_sync_runs und locations vorher übersehen und mussten in Folge-Migrationen
-- nachgezogen werden - siehe 20260805000001 und die profiles-Migrationen von eben).
CREATE TABLE tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  assigned_to uuid NOT NULL REFERENCES profiles(id),
  created_by uuid NOT NULL REFERENCES profiles(id),
  candidate_id uuid REFERENCES candidates(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'offen' CHECK (status IN ('offen', 'erledigt')),
  due_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX idx_tasks_assigned_to ON tasks (assigned_to);
CREATE INDEX idx_tasks_candidate_id ON tasks (candidate_id);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can access tasks"
ON tasks FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
