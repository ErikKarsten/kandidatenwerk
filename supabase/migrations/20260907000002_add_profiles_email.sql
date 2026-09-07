-- Kunden-Portal, Schritt 2: profiles bekommt eine email-Spalte.
--
-- profiles speichert bisher keine E-Mail-Adresse (nur auth.users hat sie) - für die
-- Portal-Zugänge-Liste auf der Kunden-Seite wollen wir die Adresse aber anzeigen,
-- ohne dafür bei jedem Seitenaufruf einen zusätzlichen Supabase-Admin-API-Call pro
-- Nutzer zu brauchen. Wird beim Einladen eines Portal-Nutzers mitgeschrieben
-- (siehe inviteClientPortalUserAction). Für bestehende Profile (Steffen, Christina)
-- bewusst NICHT rückwirkend befüllt - wird dort aktuell nirgends angezeigt.
alter table public.profiles add column if not exists email text;

NOTIFY pgrst, 'reload schema';
