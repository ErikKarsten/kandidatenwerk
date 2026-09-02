-- Entfernt die "nur eine aktive Zuordnung pro Kandidat"-Beschränkung: ein Kandidat kann
-- jetzt gleichzeitig mehreren Kanzleien aktiv zugeordnet sein (z.B. weil er parallel bei
-- mehreren passenden Kampagnen vorgeschlagen wird, statt sich vorab auf eine festlegen
-- zu müssen). Ersetzt den UNIQUE PARTIAL INDEX aus
-- 20260901000004_add_client_assignments.sql - assignToClientAction() prüft
-- entsprechend nicht mehr auf eine bestehende aktive Zuordnung, bevor eine neue angelegt
-- wird (siehe candidates/[id]/actions.ts).
DROP INDEX idx_client_assignments_one_active_per_candidate;

NOTIFY pgrst, 'reload schema';
