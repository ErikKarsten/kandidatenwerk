// Umkreis "Deutschlandweit" (Paket 69): als großer Radius gespeichert, damit Matching und
// Abstandsfilter unverändert funktionieren - 1.000 km deckt ganz Deutschland ab.
export const NATIONWIDE_KM = 1000

export function isNationwide(km: number | null | undefined): boolean {
  return typeof km === "number" && km >= NATIONWIDE_KM
}

// "25 km" bzw. "deutschlandweit" für Texte.
export function formatRadius(km: number | null | undefined): string {
  if (km === null || km === undefined) return "–"
  return isNationwide(km) ? "deutschlandweit" : `${km} km`
}
