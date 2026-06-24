CREATE TABLE client_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  role text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE client_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read client contacts"
ON client_contacts FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert client contacts"
ON client_contacts FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update client contacts"
ON client_contacts FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete client contacts"
ON client_contacts FOR DELETE TO authenticated USING (true);
