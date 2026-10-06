import { describe, expect, it } from "vitest"
import { isKs24Campaign } from "./meta-campaigns-parse"

describe("isKs24Campaign", () => {
  it("erkennt KS24 in verschiedenen Schreibweisen", () => {
    expect(isKs24Campaign("KS24 - Video Neele - Region Aachen (09/26)")).toBe(true)
    expect(isKs24Campaign("ks 24 Test")).toBe(true)
    expect(isKs24Campaign("Grone & Krull (08/26) - SFA")).toBe(false)
    expect(isKs24Campaign(null)).toBe(false)
    // Nur am Anfang des Namens (Paket 18).
    expect(isKs24Campaign("Test KS24 Kopie")).toBe(false)
    expect(isKs24Campaign("KS240 Sonstiges")).toBe(false)
  })
})
