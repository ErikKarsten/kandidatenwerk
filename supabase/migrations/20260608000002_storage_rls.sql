-- RLS-Policies für den candidate-files Storage-Bucket
-- Eingeloggte Nutzer können Dateien lesen, hochladen und löschen.

CREATE POLICY "Authenticated users can read candidate files"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'candidate-files');

CREATE POLICY "Authenticated users can upload candidate files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'candidate-files');

CREATE POLICY "Authenticated users can delete candidate files"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'candidate-files');
