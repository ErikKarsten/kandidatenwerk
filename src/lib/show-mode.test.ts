import { describe, expect, it } from "vitest"
import { anonymousName, maskContactData } from "./show-mode"

describe("Show-Modus", () => {
  it("ersetzt den Namen durch die Kennung wie im anonymen Lebenslauf", () => {
    expect(anonymousName("3f9a21bc-0000-0000-0000-000000000000")).toBe("Kandidat:in K-3F9A21")
  })

  it("blendet E-Mail und Telefon in Freitexten aus, Jahreszahlen und Beträge bleiben", () => {
    const text = "Erreichbar unter anna@example.com oder 0151 2345 6789, +49 30 23125 101. Ausbildung 2017-2021, Gehalt 45.000 €."
    expect(maskContactData(text)).toBe("Erreichbar unter ••• oder •••, •••. Ausbildung 2017-2021, Gehalt 45.000 €.")
  })
})
