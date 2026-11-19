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

describe("Setting BDA: höchstens einmal im Monat", () => {
  const bda = (iso: string) => ({ _type: "CustomActivity", id: iso, date_created: iso })
  it("sperrt, wenn die letzte weniger als einen Monat zurückliegt (auch danach angelegte)", async () => {
    const { letzteBdaImMonat } = await import("./setting-bda")
    const wechsel = new Date("2026-11-19T14:00:00Z")
    expect(letzteBdaImMonat([bda("2026-10-25T10:00:00Z")], wechsel)?.id).toBe("2026-10-25T10:00:00Z")
    expect(letzteBdaImMonat([bda("2026-11-19T13:50:00Z")], wechsel)).not.toBeNull()
    expect(letzteBdaImMonat([bda("2026-11-19T14:30:00Z")], wechsel)).not.toBeNull()
  })
  it("erlaubt eine neue, wenn die letzte über einen Monat alt ist", async () => {
    const { letzteBdaImMonat } = await import("./setting-bda")
    const wechsel = new Date("2026-11-19T14:00:00Z")
    expect(letzteBdaImMonat([bda("2026-10-18T10:00:00Z"), bda("2026-07-23T13:06:00Z")], wechsel)).toBeNull()
    expect(letzteBdaImMonat([], wechsel)).toBeNull()
  })
})
