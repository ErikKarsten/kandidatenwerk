-- Grundlage für PLZ-Bereich-Clustering (3-stellige Postleitzahlen-Präfixe) als Vorstufe
-- für das geplante Standort-Feature. Eine location bündelt campaigns, deren PLZ mit
-- denselben drei Ziffern beginnt (z.B. "402" für den Düsseldorfer Raum) - name bleibt
-- zunächst leer und kann später manuell befüllt werden (z.B. "Düsseldorf-Umgebung"),
-- siehe src/lib/location-clustering.ts. RLS/Grants bewusst nach demselben einfachen
-- Muster wie leadtable_sync_runs (keine Agentur-Scoping-Subquery) - rein interne
-- Cluster-Infos, keine kundenspezifischen Daten.
CREATE TABLE locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plz_prefix text NOT NULL UNIQUE,
  name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can access locations"
ON locations FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Siehe 20260805000001_grant_leadtable_sync_runs.sql - RLS-Policy allein reicht nicht,
-- PostgREST-Rollen brauchen zusätzlich explizite Tabellen-Grants.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.locations TO authenticated, service_role;

ALTER TABLE campaigns
  ADD COLUMN location_id uuid REFERENCES locations(id);

NOTIFY pgrst, 'reload schema';
