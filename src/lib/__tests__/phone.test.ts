import { describe, expect, it } from "vitest"
import { normalizePhone } from "@/lib/phone"

// Paket 92: gleiche Form wie sipgate (und wie candidates.phone_normalized).
describe("Telefonnummern", () => {
  it("bringt alle Schreibweisen auf eine Form", () => {
    expect(normalizePhone("+49 151 11030580")).toBe("4915111030580")
    expect(normalizePhone("+49 (0) 151 11030580")).toBe("4915111030580")
    expect(normalizePhone("0151 / 110 305-80")).toBe("4915111030580")
    expect(normalizePhone("0049 151 11030580")).toBe("4915111030580")
    expect(normalizePhone("+43 664 1234567")).toBe("436641234567")
  })

  it("lässt Unbrauchbares leer", () => {
    expect(normalizePhone(null)).toBeNull()
    expect(normalizePhone("")).toBeNull()
    expect(normalizePhone("<test lead: dummy data for phone_number>")).toBeNull()
  })
})
