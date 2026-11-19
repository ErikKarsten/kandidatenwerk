import { describe, expect, it } from "vitest"
import { istSettingBdaWechsel } from "./setting-bda"

describe("Setting BDA: welche Statuswechsel", () => {
  it("alle Quali-terminiert-Varianten nach SC Terminiert (auch Coldmail)", () => {
    for (const alt of [
      "Quali terminiert (coldmail)",
      "Quali terminiert (kalt Max)",
      "Quali terminiert (kalt Luk)",
      "Quali terminiert (LinkedIn)",
      "Quali terminiert (Kanzleistelle24)",
      "Motion Mail Quality terminiert (Enes)",
    ]) {
      expect(istSettingBdaWechsel(alt, "SC Terminiert")).toBe(true)
      expect(istSettingBdaWechsel(alt, "SC Terminiert (Coldmail)")).toBe(true)
    }
  })

  it("andere Wechsel nicht", () => {
    expect(istSettingBdaWechsel("Quali terminiert (coldmail)", "Quali terminiert (kalt Max)")).toBe(false)
    expect(istSettingBdaWechsel("Follow Up zum SC (Coldmail)", "SC Terminiert")).toBe(false)
    expect(istSettingBdaWechsel("Quali terminiert (kalt Max)", "No Show SC")).toBe(false)
    expect(istSettingBdaWechsel("Quali terminiert (kalt Max)", "Follow Up zum SC (Coldmail)")).toBe(false)
    expect(istSettingBdaWechsel(null, "SC Terminiert")).toBe(false)
  })
})
