-- Fix: campaigns_status_check liess bisher nur 'active' und 'paused' zu (live per
-- Testabfrage am 2026-09-08 verifiziert: 'completed', 'archived' und 'Archiviert'
-- wurden allesamt abgelehnt) - obwohl der Anwendungscode bereits durchgaengig von
-- 4 Zustaenden ausgeht:
--   - campaigns/new/campaign-form.tsx: Erstellungs-Dropdown bietet aktiv 'active',
--     'paused', 'completed' an (zod-Enum) - 'completed' waere also schon beim
--     Anlegen einer Kampagne fehlgeschlagen.
--   - campaigns/[id]/actions.ts (archiveCampaignAction) setzt 'Archiviert' - der
--     "Kampagne archivieren"-Button im Dashboard schlug dadurch für JEDE Kampagne
--     mit genau dieser Constraint-Verletzung fehl.
--   - campaigns-list.tsx / campaign-detail.tsx (CAMPAIGN_STATUS_LABEL/_COLORS)
--     kennen alle vier Werte inkl. 'Archiviert' bereits als Anzeige-Label.
--
-- 'Archiviert' (nicht 'archived') gewaehlt, weil das durchgaengig die im Rest der
-- App etablierte Konvention fuer den archivierten Zustand ist - clients.status
-- nutzt exakt denselben String bereits erfolgreich (siehe clients/[id]/actions.ts),
-- dort existiert gar keine einschraenkende Constraint. 'paused' bewusst NICHT als
-- Archiviert-Ersatz verwendet, da es im UI weiterhin eine eigene, andere Bedeutung
-- hat ("Pausiert" - temporär, vom Team gesetzt) und mit einem eigenen Label/Farbe
-- geführt wird; beide Zustände zusammenzulegen würde das schon vorhandene Konzept
-- kaputt machen statt nur die DB dem Code anzugleichen.
--
-- Gleiches Drop-und-neu-Anlegen-Muster wie
-- 20260803000000_extend_candidate_status_options.sql. Constraint-Name empirisch
-- bestaetigt (Fehlermeldung bei UPDATE nennt "campaigns_status_check").
--
-- Hinweis (nicht Teil dieses Fixes, separat zu klaeren): dieselbe Art Bug wurde bei
-- candidates_status_check gefunden - 'Archiviert' wird dort ebenfalls von der
-- Constraint abgelehnt, obwohl candidates/[id]/actions.ts es genauso setzt. Betrifft
-- eine andere Tabelle/Migration (20260803000000_extend_candidate_status_options.sql)
-- und wird hier bewusst nicht mit gefixt.

ALTER TABLE public.campaigns DROP CONSTRAINT IF EXISTS campaigns_status_check;

ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_status_check
  CHECK ((status = ANY (ARRAY[
    'active'::text,
    'paused'::text,
    'completed'::text,
    'Archiviert'::text
  ])));
