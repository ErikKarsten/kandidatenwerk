import { describe, expect, it } from "vitest"
import { closeLeadUrl, closeStatusLabel, normalizeCompanyName, parseGermanDate, splitBenefits } from "./close-webhook"

describe("parseGermanDate", () => {
  it.each([
    ["2026-10-01", "2026-10-01"],
    ["2026-10-01T08:00:00Z", "2026-10-01"],
    ["01.10.2026", "2026-10-01"],
    ["1.10.26", "2026-10-01"],
    ["demnächst", null],
    ["", null],
  ])("%s -> %s", (input, expected) => {
    expect(parseGermanDate(input)).toBe(expected)
  })
})

describe("normalizeCompanyName", () => {
  it("ignoriert Rechtsform, Schreibweise und Satzzeichen", () => {
    expect(normalizeCompanyName("Beyer & Brückner PartG mbB – Steuerberatung")).toBe(normalizeCompanyName("beyer und brückner steuerberatung"))
    expect(normalizeCompanyName("Müller Steuerberatungsgesellschaft mbH")).toBe("müller")
  })
})

describe("splitBenefits", () => {
  it("trennt Listen aus Close/Zapier", () => {
    expect(splitBenefits("Jobrad, 30 Tage Urlaub\n- Homeoffice")).toEqual(["Jobrad", "30 Tage Urlaub", "Homeoffice"])
    expect(splitBenefits(["a ", ""])).toEqual(["a"])
  })
})

describe("closeStatusLabel", () => {
  it("erkennt die beiden auslösenden Status", () => {
    expect(closeStatusLabel("Gewonnen")).toBe("Gewonnen")
    expect(closeStatusLabel("Won")).toBe("Gewonnen")
    expect(closeStatusLabel("Folgebesprechung zum SC vereinbart")).toBe("Folgebesprechung zum SC vereinbart")
    expect(closeStatusLabel(" Anderer Status ")).toBe("Anderer Status")
  })
  it("baut den Link zum Lead", () => {
    expect(closeLeadUrl("lead_abc")).toBe("https://app.close.com/lead/lead_abc/")
  })
})
