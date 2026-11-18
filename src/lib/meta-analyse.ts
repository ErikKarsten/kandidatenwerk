// Auswertung des Meta-Analyse-Tools (Paket 108) - Regeln 1:1 aus dem Tool übernommen
// (Motiv-Erkennung aus supabase/01_datenbank.sql "anzeigen_ansicht", Kennzahlen, "Wo es
// hakt" und "Noah gegen Neele" aus der Kampagnenanalyse-Seite). Ohne Server-Code, damit
// Seite und Tests sie teilen.

export type Urteil = "stark" | "mittel" | "schwach" | "unklar"

export interface Einschaetzung {
  bild_urteil: Urteil | null
  bild: string | null
  text_urteil: Urteil | null
  text: string | null
  benefits_urteil: Urteil | null
  benefits: string | null
  fazit: string | null
}

export interface AnzeigeAuswertung {
  id: string
  anzeige: string
  kampagne: string
  kampagne_id: string | null
  art: "Kanzleistelle24" | "Eigene Stelle" | "Kanzlei-Kampagne"
  typ: string
  region: string | null
  format: string | null
  status: string
  ueberschriften: string[]
  texte: string[]
  zielgruppe: string | null
  budget: string | null
  ausgaben: number
  impressionen: number
  klicks: number
  leads: number
  videoaufrufe_3s: number
  thruplays: number
  ctr: number | null
  cpm: number | null
  cpl: number | null
  leads_pro_100_klicks: number | null
  bildUrl: string | null
  einschaetzung: Einschaetzung | null
}

// Feste Schwellen der Kampagnenanalyse.
export const MIN_LEADS_TOP = 5
export const MIN_AUSGABE_FLOP = 100
export const MIN_AUSGABE_GALERIE = 50
export const MIN_AUSGABE_VERGLEICH = 100
export const MIN_AUSGABE_TEUERSTER_TYP = 300
export const ANZAHL_TOP_FLOP = 4

export function artAus(kampagne: string): AnzeigeAuswertung["art"] {
  if (/^KS24/i.test(kampagne)) return "Kanzleistelle24"
  if (/^Endlich Mitarbeiter/i.test(kampagne)) return "Eigene Stelle"
  return "Kanzlei-Kampagne"
}

export function regionAus(kampagne: string): string | null {
  return kampagne.match(/^KS24 - Region (.+?) \(\d\d\/\d\d\)/)?.[1] ?? null
}

// Motiv-Typ aus dem Anzeigennamen; ein von Hand gesetzter Typ hat Vorrang.
export function typAus(name: string, kampagne: string, vonHand?: string | null): string {
  if (vonHand?.trim()) return vonHand.trim()
  const n = name.toLowerCase()
  const regional = /^KS24 - Region/i.test(kampagne)
  if (n.includes("kanzleicheck")) return "Kanzleicheck"
  if (n.includes("how to")) return "How-to-Video"
  if (n.includes("gehalt")) return "Gehalts-Grafik"
  if (n.includes("papierstapel")) return "Grafik Papierstapel"
  if (n.includes("video noah")) return regional ? "Video Noah regional" : "Video Noah bundesweit"
  if (n.includes("grafik") && /^KS24/i.test(kampagne)) return "Kanzleistelle24-Grafik"
  if (n.includes("video neele")) return regional ? "Video Neele regional" : "Video Neele bundesweit"
  if (/^Endlich Mitarbeiter/i.test(kampagne)) return "Eigene Stelle"
  return "Kanzlei-Anzeige"
}

const STATUS: Record<string, string> = {
  ACTIVE: "aktiv",
  PAUSED: "pausiert",
  CAMPAIGN_PAUSED: "Kampagne pausiert",
  ADSET_PAUSED: "Anzeigengruppe pausiert",
  ARCHIVED: "archiviert",
  DELETED: "gelöscht",
  DISAPPROVED: "abgelehnt",
  PENDING_REVIEW: "in Prüfung",
  IN_PROCESS: "in Bearbeitung",
  WITH_ISSUES: "mit Problemen",
  PREAPPROVED: "vorab genehmigt",
  PENDING_BILLING_INFO: "Zahlungsdaten fehlen",
}
export const statusText = (s: string | null | undefined) => (s ? (STATUS[s] ?? s.toLowerCase()) : "Status unbekannt")

const r2 = (x: number) => Math.round(x * 100) / 100

// Kennzahlen je Anzeige aus den Summen im Zeitraum.
export function kennzahlen(z: { ausgaben: number; impressionen: number; klicks: number; leads: number }) {
  return {
    ctr: z.impressionen ? r2((100 * z.klicks) / z.impressionen) : null,
    cpm: z.impressionen ? r2((1000 * z.ausgaben) / z.impressionen) : null,
    cpl: z.leads ? r2(z.ausgaben / z.leads) : null,
    leads_pro_100_klicks: z.klicks ? Math.round((1000 * z.leads) / z.klicks) / 10 : null,
  }
}

export function summe(rows: AnzeigeAuswertung[]) {
  const ausgaben = rows.reduce((s, r) => s + r.ausgaben, 0)
  const leads = rows.reduce((s, r) => s + r.leads, 0)
  return { ausgaben: Math.round(ausgaben), leads, anzeigen: rows.length, cpl: leads ? Math.round(ausgaben / leads) : null }
}

export interface TypZeile {
  typ: string
  anzeigen: number
  ausgaben: number
  leads: number
  cpl: number | null
  ctr: number | null
}

export function nachTyp(rows: AnzeigeAuswertung[]): TypZeile[] {
  const gruppen = new Map<string, { typ: string; anzeigen: number; ausgaben: number; leads: number; klicks: number; impressionen: number }>()
  for (const r of rows) {
    const g = gruppen.get(r.typ) ?? { typ: r.typ, anzeigen: 0, ausgaben: 0, leads: 0, klicks: 0, impressionen: 0 }
    g.anzeigen += 1
    g.ausgaben += r.ausgaben
    g.leads += r.leads
    g.klicks += r.klicks
    g.impressionen += r.impressionen
    gruppen.set(r.typ, g)
  }
  return [...gruppen.values()]
    .map((g) => ({
      typ: g.typ,
      anzeigen: g.anzeigen,
      ausgaben: Math.round(g.ausgaben),
      leads: g.leads,
      cpl: g.leads ? Math.round(g.ausgaben / g.leads) : null,
      ctr: g.impressionen ? Math.round((10000 * g.klicks) / g.impressionen) / 100 : null,
    }))
    .sort((a, b) => (a.cpl ?? Infinity) - (b.cpl ?? Infinity))
}

export type Stufe = "gut" | "normal" | "schwach" | "unklar"
export interface Trichter {
  auslieferung: Stufe
  klick: Stufe
  bewerbung: Stufe
  engpass: string
  median_ctr: number | null
  median_leads_pro_100_klicks: number | null
  median_cpm: number | null
}

function median(werte: (number | null)[]): number | null {
  const v = werte.filter((x): x is number => x != null && Number.isFinite(x)).sort((a, b) => a - b)
  if (!v.length) return null
  const m = Math.floor(v.length / 2)
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}

// "Wo es hakt": jede Anzeige gegen den Median aller Anzeigen ab 50 € Ausgaben (ohne eigene
// Stellen). gut = mind. 20 % besser, schwach = mind. 20 % schlechter (CPM: 25 % teurer).
export function trichter(rows: AnzeigeAuswertung[]): Map<string, Trichter> {
  const basis = rows.filter((r) => r.art !== "Eigene Stelle" && r.ausgaben >= MIN_AUSGABE_GALERIE)
  const mCtr = median(basis.map((r) => r.ctr))
  const mCr = median(basis.map((r) => r.leads_pro_100_klicks))
  const mCpm = median(basis.map((r) => r.cpm))
  const vergleich = (wert: number | null, m: number | null): Stufe =>
    wert == null || m == null ? "unklar" : wert >= m * 1.2 ? "gut" : wert <= m * 0.8 ? "schwach" : "normal"
  const out = new Map<string, Trichter>()
  for (const r of rows) {
    const klick = vergleich(r.ctr, mCtr)
    const bewerbung = r.klicks < 20 ? "unklar" : vergleich(r.leads_pro_100_klicks ?? 0, mCr)
    const auslieferung: Stufe = r.cpm == null || mCpm == null ? "unklar" : r.cpm >= mCpm * 1.25 ? "schwach" : r.cpm <= mCpm * 0.8 ? "gut" : "normal"
    const engpass =
      klick === "schwach"
        ? "wird kaum geklickt"
        : bewerbung === "schwach"
          ? "Klicks, aber kaum Bewerbungen"
          : auslieferung === "schwach"
            ? "Meta spielt sie teuer aus"
            : "Kein klarer Engpass"
    out.set(r.id, {
      auslieferung,
      klick,
      bewerbung,
      engpass,
      median_ctr: mCtr == null ? null : r2(mCtr),
      median_leads_pro_100_klicks: mCr == null ? null : r2(mCr),
      median_cpm: mCpm == null ? null : r2(mCpm),
    })
  }
  return out
}

// Regionskampagnen, in denen beide Videos je mind. 100 € ausgegeben haben. "Günstiger"
// heißt mind. 10 % mehr Leads pro Euro.
export function noahGegenNeele(rows: AnzeigeAuswertung[]) {
  const regionen = new Map<string, { noah_ausgaben: number; noah_leads: number; neele_ausgaben: number; neele_leads: number }>()
  for (const r of rows) {
    if (!r.region || (r.typ !== "Video Noah regional" && r.typ !== "Video Neele regional")) continue
    const g = regionen.get(r.region) ?? { noah_ausgaben: 0, noah_leads: 0, neele_ausgaben: 0, neele_leads: 0 }
    if (r.typ === "Video Noah regional") {
      g.noah_ausgaben += r.ausgaben
      g.noah_leads += r.leads
    } else {
      g.neele_ausgaben += r.ausgaben
      g.neele_leads += r.leads
    }
    regionen.set(r.region, g)
  }
  const verglichen = [...regionen.entries()]
    .filter(([, g]) => g.noah_ausgaben >= MIN_AUSGABE_VERGLEICH && g.neele_ausgaben >= MIN_AUSGABE_VERGLEICH)
    .map(([region, g]) => {
      const noah = g.noah_leads / g.noah_ausgaben
      const neele = g.neele_leads / g.neele_ausgaben
      return { region, guenstiger: noah > neele * 1.1 ? "Noah" : neele > noah * 1.1 ? "Neele" : "gleich" }
    })
  return {
    regionen: verglichen.length,
    noah: verglichen.filter((r) => r.guenstiger === "Noah").length,
    neele: verglichen.filter((r) => r.guenstiger === "Neele").length,
  }
}

export function kampagnen(rows: AnzeigeAuswertung[]) {
  const gruppen = new Map<string, { kampagne: string; ausgaben: number; leads: number }>()
  for (const r of rows) {
    const g = gruppen.get(r.kampagne) ?? { kampagne: r.kampagne, ausgaben: 0, leads: 0 }
    g.ausgaben += r.ausgaben
    g.leads += r.leads
    gruppen.set(r.kampagne, g)
  }
  return [...gruppen.values()]
    .map((g) => ({ kampagne: g.kampagne, ausgaben: Math.round(g.ausgaben), leads: g.leads, cpl: g.leads ? Math.round(g.ausgaben / g.leads) : null }))
    .sort((a, b) => b.ausgaben - a.ausgaben)
}

// "günstig" = mind. 20 % unter dem Schnitt, "teuer" = mind. 50 % darüber.
export function urteilGegenSchnitt(r: AnzeigeAuswertung, schnitt: number | null): "good" | "bad" | "" {
  if (!schnitt) return ""
  if (!r.leads) return r.ausgaben >= MIN_AUSGABE_GALERIE ? "bad" : ""
  if (r.cpl != null && r.cpl <= schnitt * 0.8) return "good"
  if (r.cpl != null && r.cpl >= schnitt * 1.5) return "bad"
  return ""
}

export function laeuftGut(rows: AnzeigeAuswertung[]): AnzeigeAuswertung[] {
  return rows
    .filter((r) => r.art !== "Eigene Stelle" && r.cpl != null && r.leads >= MIN_LEADS_TOP && r.ausgaben >= MIN_AUSGABE_FLOP)
    .sort((x, y) => x.cpl! - y.cpl! || y.leads - x.leads)
    .slice(0, ANZAHL_TOP_FLOP)
}

export function laeuftSchlecht(rows: AnzeigeAuswertung[]): AnzeigeAuswertung[] {
  return rows
    .filter((r) => r.art !== "Eigene Stelle" && r.ausgaben >= MIN_AUSGABE_FLOP)
    .sort((x, y) => y.ausgaben / Math.max(y.leads, 1) - x.ausgaben / Math.max(x.leads, 1))
    .slice(0, ANZAHL_TOP_FLOP)
}

// Günstigster Typ (ab 10 Leads) und teuerster Typ (ab 300 € Ausgaben), ohne eigene Stellen.
export function besterUndTeuersterTyp(typen: TypZeile[]) {
  const t = typen.filter((r) => r.typ !== "Eigene Stelle" && r.cpl != null)
  const k1 = t.filter((r) => r.leads >= 10)
  const k2 = t.filter((r) => r.ausgaben >= MIN_AUSGABE_TEUERSTER_TYP)
  return {
    bester: k1.length ? k1.reduce((a, b) => (b.cpl! < a.cpl! ? b : a)) : null,
    teuerster: k2.length ? k2.reduce((a, b) => (b.cpl! > a.cpl! ? b : a)) : null,
  }
}

// Kurzer Anzeigename für Karten (aus der Kampagnenanalyse übernommen).
export function kurzname(r: Pick<AnzeigeAuswertung, "typ" | "region" | "kampagne" | "anzeige">): string {
  if (r.region) return `${r.typ.replace(/ regional$/, "")}, ${r.region}`
  if (/bundesweit$/.test(r.typ)) return `${r.typ.replace(/ bundesweit$/, "")}, bundesweit`
  let k = r.kampagne.replace(/^KS24\s*-\s*/, "")
  k = k.replace(/\s*[–-]?\s*\(?\d{1,2}\/\d{1,2}(\/\d{2,4})?\)?/g, " ")
  k = k.replace(/\s+Kanzleicheck mit Noah\s*$/i, " ")
  k = k.replace(/\s+[–-]\s*(Neu|SFA|SFW|STB|SB)\s*$/i, "").replace(/\s+(Sfa|SFA|SfA)\s*$/, "")
  return k.replace(/\s+[–-]\s*$/, "").replace(/\s{2,}/g, " ").trim() || r.anzeige
}

export function unterzeile(r: Pick<AnzeigeAuswertung, "typ" | "region" | "anzeige">): string {
  if (r.region) return "Regionskampagne Kanzleistelle24"
  if (r.typ === "Kanzleicheck") return "Kanzleicheck-Video"
  if (/bundesweit$/.test(r.typ)) return "Bundesweite Kampagne Kanzleistelle24"
  const m = r.anzeige.match(/[-–]\s*([A-D])\s*$/)
  return m ? `${r.typ}, Variante ${m[1]}` : r.typ
}
