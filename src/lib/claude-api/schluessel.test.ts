import { describe, expect, it } from "vitest"
import { neuerSchluessel, sha256Hex } from "./schluessel"

describe("API-Schlüssel", () => {
  it("erzeugt zufällige kw_-Schlüssel und speichert nur den Hash", async () => {
    const a = await neuerSchluessel()
    const b = await neuerSchluessel()
    expect(a.schluessel).toMatch(/^kw_[A-Za-z0-9_-]{43}$/)
    expect(a.schluessel).not.toBe(b.schluessel)
    expect(a.praefix).toBe(a.schluessel.slice(0, 10))
    expect(a.hash).toBe(await sha256Hex(a.schluessel))
    expect(a.hash).not.toContain(a.schluessel.slice(3))
  })
})
