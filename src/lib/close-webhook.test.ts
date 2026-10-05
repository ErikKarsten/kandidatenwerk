import { describe, expect, it } from "vitest"
import { parseContactBlock, normalizePayload, closeLeadUrl, closeStatusLabel, collectPositions, normalizeCompanyName, parseGermanDate, splitBenefits } from "./close-webhook"

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

describe("collectPositions", () => {
  it("liest die JSON-Liste der Zapier-AI (auch mit Code-Block) und die Einzelfelder", () => {
    const r = collectPositions({
      stellen_json: '```json\n[{"titel":"Steuerfachangestellte","software":"DATEV"},{"titel":""}]\n```',
      stelle_titel: "Bilanzbuchhalter",
    })
    expect(r.map((p) => p.titel)).toEqual(["Steuerfachangestellte", "Bilanzbuchhalter"])
  })
  it("ignoriert kaputtes JSON", () => {
    expect(collectPositions({ stellen_json: "keine Liste" })).toEqual([])
  })
})

describe("normalizePayload", () => {
  it("vereinheitlicht Feldnamen aus Zapier", () => {
    expect(normalizePayload({ " Close Lead ID ": "lead_1", "Firma": "X", "stelle-titel": "Y" })).toEqual({ close_lead_id: "lead_1", firma: "X", stelle_titel: "Y" })
  })
  it("packt verschachtelte und Array-Daten aus", () => {
    expect(normalizePayload({ data: { firma: "X" } })).toEqual({ firma: "X" })
    expect(normalizePayload([{ firma: "X", close_lead_id: "l" }])).toEqual({ firma: "X", close_lead_id: "l" })
  })
})

describe("parseContactBlock", () => {
  it("liest den Close-Kontakt-Block aus", () => {
    expect(parseContactBlock("contact_first_name: Agathe\ncontact_id: cont_1\ncontact_last_name: Grenz\nemail: a@b.de\nphone: +49123")).toEqual({
      name: "Agathe Grenz",
      email: "a@b.de",
      phone: "+49123",
    })
  })
  it("lässt normale Namen in Ruhe", () => {
    expect(parseContactBlock("Agathe Grenz")).toBeNull()
  })
})
