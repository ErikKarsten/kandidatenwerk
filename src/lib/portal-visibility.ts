// Kundenportal zeigt nur vorqualifizierte Kandidaten (Paket 19, T-86) - bekommt ein
// zugeordneter Kandidat intern einen anderen Status (z.B. Abgelehnt), verschwindet er aus
// dem Portal. Beispiel-Leads bleiben sichtbar.
export const PORTAL_VISIBLE_STATUS = "vorqualifiziert"

export function isPortalVisible(candidate: { status?: string | null; is_demo?: boolean | null } | null | undefined): boolean {
  return !!candidate && (!!candidate.is_demo || candidate.status === PORTAL_VISIBLE_STATUS)
}
