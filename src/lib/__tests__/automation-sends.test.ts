import { describe, expect, it } from "vitest"
import { recipientsFromHistory } from "@/lib/automation-sends"

// Paket 84: Empfänger älterer Läufe aus dem Verlauf.
describe("Versandprotokoll", () => {
  it("liest die Empfänger aus dem Verlaufseintrag", () => {
    expect(recipientsFromHistory('Automatisierung "Neuer Kandidat für die Kanzlei" ausgelöst (Mail an a@x.de, b@y.de)', "Neuer Kandidat für die Kanzlei")).toEqual(["a@x.de", "b@y.de"])
  })

  it("passt nur zur eigenen Automatisierung", () => {
    expect(recipientsFromHistory('Automatisierung "Absage" ausgelöst (Mail an a@x.de)', "Nicht erreicht")).toBeNull()
    expect(recipientsFromHistory('Automatisierung "Absage" erneut verschickt (Mail an a@x.de)', "Absage")).toBeNull()
  })
})
