-- Add logo_url column to clients
ALTER TABLE clients ADD COLUMN IF NOT EXISTS logo_url text;

-- Create client-logos storage bucket (public, for direct URL access)
INSERT INTO storage.buckets (id, name, public)
VALUES ('client-logos', 'client-logos', true)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for client-logos bucket
CREATE POLICY "Authenticated users can upload client logos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'client-logos');

CREATE POLICY "Authenticated users can update client logos"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'client-logos');

CREATE POLICY "Authenticated users can delete client logos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'client-logos');
