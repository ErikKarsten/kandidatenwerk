CREATE TABLE campaign_automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name text NOT NULL,
  trigger text NOT NULL DEFAULT 'new_lead',
  trigger_status text,
  delay_seconds integer NOT NULL DEFAULT 30,
  active boolean NOT NULL DEFAULT true,
  recipient text NOT NULL DEFAULT 'candidate',
  sender_email text NOT NULL DEFAULT '',
  sender_name text NOT NULL DEFAULT '',
  subject text NOT NULL DEFAULT '',
  body_html text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE campaign_automations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read campaign automations"
ON campaign_automations FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert campaign automations"
ON campaign_automations FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update campaign automations"
ON campaign_automations FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete campaign automations"
ON campaign_automations FOR DELETE TO authenticated USING (true);

NOTIFY pgrst, 'reload schema';
