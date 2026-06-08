ALTER TABLE candidates ADD COLUMN IF NOT EXISTS custom_fields jsonb DEFAULT '{}';

CREATE TABLE IF NOT EXISTS candidate_files (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  name text NOT NULL,
  storage_path text NOT NULL,
  size integer,
  mime_type text,
  uploaded_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('candidate-files', 'candidate-files', false, 52428800)
ON CONFLICT (id) DO NOTHING;
