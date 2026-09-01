-- Erweitert profiles_role_check um "agency_member" - für Team-Mitglieder ohne
-- Admin-Rechte (z.B. c.hohler@endlich-mitarbeiter.de, deren fehlender Profil-Eintrag
-- der Anlass für diese Migration war). Bestehende erlaubte Werte "agency_admin" und
-- "client" bleiben unverändert erhalten, nur um einen dritten Wert ergänzt.
ALTER TABLE public.profiles DROP CONSTRAINT profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('agency_admin', 'agency_member', 'client'));

NOTIFY pgrst, 'reload schema';
