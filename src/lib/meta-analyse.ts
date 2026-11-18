// Kampagnenart, Region und Motiv-Typ einer Meta-Anzeige (Paket 108) - 1:1 die Regeln der
// Ansicht "anzeigen_ansicht" aus dem Meta-Analyse-Tool (supabase/01_datenbank.sql dort).
// Ein von Hand gesetzter Motiv-Typ (meta_anzeigen.motiv_typ) hat Vorrang.

export type Art = "Kanzleistelle24" | "Eigene Stelle" | "Kanzlei-Kampagne"

export function artAus(kampagne: string): Art {
  if (/^KS24/i.test(kampagne)) return "Kanzleistelle24"
  if (/^Endlich Mitarbeiter/i.test(kampagne)) return "Eigene Stelle"
  return "Kanzlei-Kampagne"
}

export function regionAus(kampagne: string): string | null {
  return kampagne.match(/^KS24 - Region (.+?) \(\d\d\/\d\d\)/)?.[1] ?? null
}

export function typAus(name: string, kampagne: string, vonHand?: string | null): string {
  if (vonHand?.trim()) return vonHand.trim()
  const n = name.toLowerCase()
  const regional = /^KS24 - Region/i.test(kampagne)
  if (n.includes("kanzleicheck")) return "Kanzleicheck"
  if (n.includes("how to")) return "How-to-Video"
  if (n.includes("gehalt")) return "Gehalts-Grafik"
  if (n.includes("video noah")) return regional ? "Video Noah regional" : "Video Noah bundesweit"
  if (n.includes("grafik") && /^KS24/i.test(kampagne)) return "Kanzleistelle24-Grafik"
  if (n.includes("video neele")) return regional ? "Video Neele regional" : "Video Neele bundesweit"
  if (/^Endlich Mitarbeiter/i.test(kampagne)) return "Eigene Stelle"
  return "Kanzlei-Anzeige"
}
