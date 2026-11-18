import { describe, expect, it } from "vitest"
import {
  artAus,
  kennzahlen,
  laeuftGut,
  laeuftSchlecht,
  noahGegenNeele,
  nachTyp,
  regionAus,
  trichter,
  typAus,
  type AnzeigeAuswertung,
} from "./meta-analyse"

function ad(over: Partial<AnzeigeAuswertung>): AnzeigeAuswertung {
  const base = { ausgaben: 100, impressionen: 5000, klicks: 50, leads: 5 }
  const z = { ...base, ...over }
  return {
    id: "1",
    anzeige: "Anzeige",
    kampagne: "KS24 - Region Allgäu und Oberschwaben (10/26)",
    art: "Kanzleistelle24",
    typ: "Kanzlei-Anzeige",
    region: null,
    format: "Bild",
    status: "aktiv",
    ueberschriften: [],
    texte: [],
    zielgruppe: null,
    budget: null,
    videoaufrufe_3s: 0,
    thruplays: 0,
    bildUrl: null,
    einschaetzung: null,
    ...kennzahlen(z),
    ...z,
  } as AnzeigeAuswertung
}

describe("Meta-Analyse", () => {
  it("erkennt Motiv, Art und Region wie das Meta-Analyse-Tool", () => {
    const k = "KS24 - Region Allgäu und Oberschwaben (10/26)"
    expect(regionAus(k)).toBe("Allgäu und Oberschwaben")
    expect(artAus(k)).toBe("Kanzleistelle24")
    expect(artAus("Endlich Mitarbeiter - Recruiter")).toBe("Eigene Stelle")
    expect(artAus("Kanzlei Müller - Sfa")).toBe("Kanzlei-Kampagne")
    expect(typAus("KS24 - Video Noah (09/26)", k)).toBe("Video Noah regional")
    expect(typAus("KS24 - Video Neele", "KS24 - Bundesweit")).toBe("Video Neele bundesweit")
    expect(typAus("KS24 - Video Neele (09/26) - Grafik", k)).toBe("Kanzleistelle24-Grafik")
    expect(typAus("Kanzleicheck mit Noah", "Kanzlei X")).toBe("Kanzleicheck")
    expect(typAus("irgendwas", k, "Gehalts-Grafik")).toBe("Gehalts-Grafik")
  })

  it("rechnet Kennzahlen und Motiv-Summen", () => {
    expect(kennzahlen({ ausgaben: 200, impressionen: 10000, klicks: 80, leads: 4 })).toEqual({ ctr: 0.8, cpm: 20, cpl: 50, leads_pro_100_klicks: 5 })
    const t = nachTyp([ad({ id: "a", typ: "A", ausgaben: 100, leads: 10 }), ad({ id: "b", typ: "B", ausgaben: 300, leads: 3 }), ad({ id: "c", typ: "A", ausgaben: 100, leads: 0 })])
    expect(t.map((r) => [r.typ, r.cpl])).toEqual([["A", 20], ["B", 100]])
  })

  it("wählt gute und schlechte Anzeigen ohne eigene Stellen", () => {
    const rows = [
      ad({ id: "gut", ausgaben: 120, leads: 12 }),
      ad({ id: "teuer", ausgaben: 400, leads: 1 }),
      ad({ id: "eigen", art: "Eigene Stelle", ausgaben: 500, leads: 0 }),
      ad({ id: "klein", ausgaben: 40, leads: 6 }),
    ]
    expect(laeuftGut(rows).map((r) => r.id)).toEqual(["gut"])
    expect(laeuftSchlecht(rows).map((r) => r.id)).toEqual(["teuer", "gut"])
  })

  it("findet den Engpass gegen den Median", () => {
    const rows = [
      ad({ id: "a", impressionen: 10000, klicks: 100, leads: 10 }),
      ad({ id: "b", impressionen: 10000, klicks: 100, leads: 10 }),
      ad({ id: "c", impressionen: 10000, klicks: 20, leads: 2 }),
    ]
    expect(trichter(rows).get("c")?.engpass).toBe("wird kaum geklickt")
    expect(trichter(rows).get("a")?.engpass).toBe("Kein klarer Engpass")
  })

  it("vergleicht Noah und Neele je Region", () => {
    const rows = [
      ad({ id: "1", typ: "Video Noah regional", region: "Allgäu", ausgaben: 200, leads: 10 }),
      ad({ id: "2", typ: "Video Neele regional", region: "Allgäu", ausgaben: 200, leads: 4 }),
      ad({ id: "3", typ: "Video Noah regional", region: "Harz", ausgaben: 50, leads: 4 }),
      ad({ id: "4", typ: "Video Neele regional", region: "Harz", ausgaben: 200, leads: 4 }),
    ]
    expect(noahGegenNeele(rows)).toEqual({ regionen: 1, noah: 1, neele: 0 })
  })
})
