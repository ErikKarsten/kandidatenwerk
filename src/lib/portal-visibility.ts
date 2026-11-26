// Kundenportal zeigt nur vorqualifizierte Kandidaten (Paket 19, T-86) - bekommt ein
// zugeordneter Kandidat intern einen anderen Status (z.B. Abgelehnt), verschwindet er aus
// dem Portal. Beispiel-Leads bleiben sichtbar. Ausnahme: Kanzleien mit „alle Leadeingänge
// im Portal“ (Paket 117, portal-alle-leads.ts) sehen jeden zugeordneten Lead.
export const PORTAL_VISIBLE_STATUS = "vorqualifiziert"

export function isPortalVisible(candidate: { status?: string | null; is_demo?: boolean | null } | null | undefined, alleLeads = false): boolean {
  return !!candidate && (alleLeads || !!candidate.is_demo || candidate.status === PORTAL_VISIBLE_STATUS)
}
