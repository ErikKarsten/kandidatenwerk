-- Paket 98: Versandprotokoll der Automatisierungen blieb leer.
-- Der Versand legt in campaign_automation_runs erst einen Eintrag an (Reservierung) und trägt
-- nach dem Versand die Empfänger nach. service_role durfte bisher nur SELECT und INSERT
-- (20260922000002). Das Nachtragen (UPDATE) scheiterte deshalb lautlos: Seit Paket 84 hat kein
-- einziger "gesendet"-Eintrag Empfänger, und der Reiter "Automatisierungen" zeigt die Mails nicht.
-- Ohne DELETE blieb außerdem bei einem Versandfehler die Reservierung stehen, sodass die Mail
-- nie erneut versucht wurde. "Erneut senden" (upsert) braucht UPDATE ebenfalls.
-- Nur service_role: Die Tabelle hat RLS ohne Policies, das Team greift über Server-Actions zu.

GRANT UPDATE, DELETE ON public.campaign_automation_runs TO service_role;

NOTIFY pgrst, 'reload schema';
