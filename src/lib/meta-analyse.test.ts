import { describe, expect, it } from "vitest"
import { artAus, regionAus, typAus } from "./meta-analyse"

describe("Meta-Analyse: Ansicht anzeigen_ansicht", () => {
  it("erkennt Art, Region und Motiv wie das Meta-Analyse-Tool", () => {
    const k = "KS24 - Region Allgäu und Oberschwaben (10/26)"
    expect(regionAus(k)).toBe("Allgäu und Oberschwaben")
    expect(regionAus("KS24 - Bundesweit")).toBeNull()
    expect(artAus(k)).toBe("Kanzleistelle24")
    expect(artAus("Endlich Mitarbeiter - Recruiter")).toBe("Eigene Stelle")
    expect(artAus("Kanzlei Müller - Sfa")).toBe("Kanzlei-Kampagne")
    expect(typAus("KS24 - Video Noah (09/26)", k)).toBe("Video Noah regional")
    expect(typAus("KS24 - Video Neele", "KS24 - Bundesweit")).toBe("Video Neele bundesweit")
    expect(typAus("KS24 - Video Neele (09/26) - Grafik", k)).toBe("Kanzleistelle24-Grafik")
    expect(typAus("Kanzleicheck mit Noah", "Kanzlei X")).toBe("Kanzleicheck")
    expect(typAus("Recruiter", "Endlich Mitarbeiter - Recruiter")).toBe("Eigene Stelle")
    expect(typAus("irgendwas", k, "Gehalts-Grafik")).toBe("Gehalts-Grafik")
  })
})
