import { describe, expect, it } from "vitest"
import { berufsbildChoices, berufsbildKey, berufsbildLabel } from "@/lib/berufsbild"

describe("Berufsbilder", () => {
  const options = [
    { value: "steuerfachangestellte", label: "Steuerfachangestellte", active: true },
    { value: "alt", label: "Altes Berufsbild", active: false },
  ]

  it("zeigt Bezeichnungen, unbekannte Schlüssel unverändert", () => {
    expect(berufsbildLabel("steuerfachangestellte", options)).toBe("Steuerfachangestellte")
    expect(berufsbildLabel("unbekannt", options)).toBe("unbekannt")
    expect(berufsbildLabel(null, options)).toBeNull()
  })

  it("Formulare zeigen aktive plus den aktuellen Wert", () => {
    expect(berufsbildChoices(options).map((o) => o.value)).toEqual(["steuerfachangestellte"])
    expect(berufsbildChoices(options, "alt").map((o) => o.value)).toEqual(["steuerfachangestellte", "alt"])
  })

  it("baut Schlüssel aus Bezeichnungen", () => {
    expect(berufsbildKey("Lohn- & Gehaltsbuchhalter (m/w/d)")).toBe("lohn_gehaltsbuchhalter")
    expect(berufsbildKey("Kauffrau für Büromanagement")).toBe("kauffrau_fuer_bueromanagement")
  })
})
