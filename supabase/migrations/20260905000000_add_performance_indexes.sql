-- Performance-Indizes für Spalten, die auf den Haupt-Listenseiten (Dashboard, Kunden-,
-- Kandidaten-Übersicht) ständig gefiltert/verknüpft/sortiert werden, aber bisher keinen
-- Index hatten - siehe Performance-Diagnose vom 2026-09-05. Bei den aktuellen
-- Tabellengrößen (612 Kandidaten, 155 Kampagnen, 111 Kunden) noch nicht spürbar, aber
-- reiner Full-Table-Scan bei jeder Filterung/Sortierung - wird mit dem täglichen
-- Leadtable-Sync (kontinuierlich neue Kandidaten) zunehmend relevant. Rein additiv,
-- keine Downtime, kein Risiko für bestehende Abfragen.
CREATE INDEX idx_candidates_status ON candidates (status);
CREATE INDEX idx_candidates_campaign_id ON candidates (campaign_id);
CREATE INDEX idx_candidates_created_at ON candidates (created_at);
CREATE INDEX idx_clients_status ON clients (status);
CREATE INDEX idx_campaigns_client_id ON campaigns (client_id);
