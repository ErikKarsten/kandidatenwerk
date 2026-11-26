import { describe, expect, it } from "vitest"
import { berufsbildAusFormular } from "./lead-zuordnung"

describe("berufsbildAusFormular", () => {
  it("erkennt die Kürzel aus Formularnamen", () => {
    expect(berufsbildAusFormular("Roggel Steuerberatung - SB")).toBe("steuerberater")
    expect(berufsbildAusFormular("Roggel Steuerberatung - LBH")).toBe("lohnbuchhalter")
    expect(berufsbildAusFormular("Schmitt & Bruckbauer - SSFW")).toBe("steuerfachwirt")
    expect(berufsbildAusFormular("Friebe, Prinz & Partner - SFA - Olpe")).toBe("steuerfachangestellte")
    expect(berufsbildAusFormular("Steuerfachangestellte (mIwId) in Berlin")).toBe("steuerfachangestellte")
  })

  it("liefert null ohne erkennbares Berufsbild", () => {
    expect(berufsbildAusFormular("Voigt & Scheuerle")).toBeNull()
    expect(berufsbildAusFormular("Mandantengewinnung ab 29 oktober 2026")).toBeNull()
  })
})
