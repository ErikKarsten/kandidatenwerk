-- Behebt eine RLS-Lücke auf profiles: das GRANT SELECT TO authenticated
-- (20260715000003_grant_profiles_select.sql) allein reicht nicht, RLS schränkt
-- trotzdem ein - vermutlich existiert nur die Standard-Policy "Nutzer sieht nur die
-- eigene Zeile" (USING (auth.uid() = id)), da profiles außerhalb der getrackten
-- Migrationen entstanden ist und ich den genauen Policy-Namen daher nicht kenne.
--
-- Live bestätigt beim Testen der Verlauf-Autorenanzeige (history-section.tsx): ein
-- Verlaufseintrag mit created_by = eigene User-ID zeigte den Namen korrekt an, ein
-- Eintrag mit created_by = andere User-ID nicht, obwohl deren profiles-Zeile existiert.
--
-- Ergänzt statt ersetzt eine weitere Policy - mehrere PERMISSIVE-Policies für denselben
-- Befehl werden von Postgres mit OR verknüpft, eine bestehende einschränkende Policy
-- bleibt also unangetastet bestehen und wird durch diese hier einfach erweitert.
CREATE POLICY "Authenticated users can read all profiles"
ON public.profiles FOR SELECT TO authenticated USING (true);

NOTIFY pgrst, 'reload schema';
