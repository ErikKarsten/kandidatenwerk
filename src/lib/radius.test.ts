import { describe, expect, it } from "vitest"
import { NATIONWIDE_KM, formatRadius, isNationwide } from "./radius"

describe("Umkreis (Paket 69)", () => {
  it("erkennt deutschlandweit und formatiert", () => {
    expect(isNationwide(NATIONWIDE_KM)).toBe(true)
    expect(isNationwide(200)).toBe(false)
    expect(isNationwide(null)).toBe(false)
    expect(formatRadius(25)).toBe("25 km")
    expect(formatRadius(NATIONWIDE_KM)).toBe("deutschlandweit")
    expect(formatRadius(null)).toBe("–")
  })
})
