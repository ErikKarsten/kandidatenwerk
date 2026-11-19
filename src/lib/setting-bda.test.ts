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

describe("Setting BDA: Stichpunkte", () => {
  const felder = [
    { id: "cf_vorab", name: "Vorabinformation", description: null, type: "richtextarea" },
    { id: "cf_a", name: "Frage A", description: null, type: "text" },
    { id: "cf_b", name: "Frage B", description: null, type: "text" },
    { id: "cf_c", name: "Frage C", description: null, type: "text" },
  ]
  it("mehrere Punkte je Zeile mit •, einer ohne, keiner als -", async () => {
    const { settingBdaFormatieren } = await import("./setting-bda")
    const w = settingBdaFormatieren({ cf_vorab: ["Nürnberg <Zentrale>", "DATEV"], cf_a: ["1-2", "auch mehr möglich"], cf_b: ["3.500-4.500"], cf_c: [] }, felder)
    expect(w.cf_a).toBe("• 1-2\n• auch mehr möglich")
    expect(w.cf_b).toBe("3.500-4.500")
    expect(w.cf_c).toBe("-")
    expect(w.cf_vorab).toContain("<ul><li>Nürnberg &lt;Zentrale&gt;</li><li>DATEV</li></ul>")
  })
  it("Text mit Zeilen oder Semikolon wird zerlegt", async () => {
    const { stichpunkte } = await import("./setting-bda")
    expect(stichpunkte("a\n- b; c")).toEqual(["a", "b", "c"])
    expect(stichpunkte("-")).toEqual([])
  })
})

describe("Setting BDA: immer anlegen, aber nur eine automatische je Wechsel", () => {
  const bda = (iso: string, auto: boolean) => ({
    _type: "CustomActivity",
    id: iso,
    date_created: iso,
    "custom.cf_vorab": auto ? "<body><ul><li>x</li></ul><p><em>Automatisch aus der Gesprächsaufnahme erstellt (Kandidatenwerk, KI)</em></p></body>" : "<body><p>von Hand</p></body>",
  })
  it("händische sperren nicht, eine automatische zum Wechsel schon", async () => {
    const { automatischeBdaZumWechsel } = await import("./setting-bda")
    const wechsel = new Date("2026-11-19T14:00:00Z")
    expect(automatischeBdaZumWechsel([bda("2026-11-19T13:50:00Z", false), bda("2026-11-19T14:20:00Z", false)], wechsel)).toBeNull()
    expect(automatischeBdaZumWechsel([bda("2026-11-19T14:20:00Z", true)], wechsel)).not.toBeNull()
  })
  it("eine ältere automatische (früherer Wechsel) sperrt nicht", async () => {
    const { automatischeBdaZumWechsel } = await import("./setting-bda")
    expect(automatischeBdaZumWechsel([bda("2026-10-01T10:00:00Z", true)], new Date("2026-11-19T14:00:00Z"))).toBeNull()
  })
})
