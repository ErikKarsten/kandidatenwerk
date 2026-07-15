-- Pool-Modell: Zuordnungstabelle für automatisches Kandidaten-Kampagnen-Matching (n:m)
CREATE TABLE candidate_campaign_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  distance_km numeric,
  status text NOT NULL DEFAULT 'neu',
  matched_automatically boolean NOT NULL DEFAULT true,
  matched_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (candidate_id, campaign_id)
);
CREATE INDEX idx_candidate_campaign_matches_candidate_id ON candidate_campaign_matches (candidate_id);
CREATE INDEX idx_candidate_campaign_matches_campaign_id ON candidate_campaign_matches (campaign_id);
ALTER TABLE candidate_campaign_matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Matches der eigenen Agentur"
ON candidate_campaign_matches FOR ALL TO public
USING (
  campaign_id IN (
    SELECT campaigns.id FROM campaigns
    WHERE campaigns.client_id IN (
      SELECT clients.id FROM clients
      WHERE clients.agency_id = (
        SELECT profiles.agency_id FROM profiles WHERE profiles.id = auth.uid()
      )
    )
  )
);
NOTIFY pgrst, 'reload schema';
