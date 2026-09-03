-- Grundlage für Datei-Upload bei Kunden, analog zu candidate_files (siehe
-- 20260608000001_candidate_detail.sql / 20260608000002_storage_rls.sql) - gleiche
-- Spaltenstruktur (file_name/file_path/file_size/mime_type, wie candidate_files sie
-- inzwischen tatsächlich hat - siehe src/types/database.ts), nur client_id statt
-- candidate_id. RLS bewusst einfaches "FOR ALL TO authenticated"-Muster wie bei
-- tasks/locations/leadtable_sync_runs (keine Agentur-Scoping-Subquery) - rein interne
-- Dateiverwaltung. GRANTs direkt mit in dieser Migration (siehe
-- 20260901000003_add_tasks.sql zur Begründung, warum das nicht mehr in
-- Folge-Migrationen nachgezogen werden soll).
CREATE TABLE client_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_size integer,
  mime_type text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_files_client_id ON client_files (client_id);

ALTER TABLE client_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can access client files"
ON client_files FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_files TO authenticated, service_role;

-- Storage-Bucket für hochgeladene Kunden-Dateien, analog zu candidate-files (gleiches
-- 50 MB-Limit, nicht öffentlich - Zugriff nur über zeitlich begrenzte Signed URLs, siehe
-- clients/[id]/page.tsx).
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('client-files', 'client-files', false, 52428800)
ON CONFLICT (id) DO NOTHING;

-- RLS-Policies für den client-files Storage-Bucket, identisches Muster wie
-- 20260608000002_storage_rls.sql für candidate-files.
CREATE POLICY "Authenticated users can read client files"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'client-files');

CREATE POLICY "Authenticated users can upload client files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'client-files');

CREATE POLICY "Authenticated users can delete client files"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'client-files');

NOTIFY pgrst, 'reload schema';
