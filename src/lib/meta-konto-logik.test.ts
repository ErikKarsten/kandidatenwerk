import { describe, expect, it } from "vitest"
import { bewerte, type KontoStand } from "./meta-konto-logik"

// 12:00 Uhr in Berlin (Winterzeit = UTC+1)
const MITTAG = "2026-11-18T11:00:00.000Z"
const minus = (iso: string, min: number) => new Date(Date.parse(iso) - min * 60_000).toISOString()

function stand(over: Partial<KontoStand> = {}): KontoStand {
  return {
    konto_id: "act_1",
    name: "Konto",
    waehrung: "EUR",
    kontostatus: 1,
    sperrgrund: 0,
    ausgabenlimit: null,
    ausgegeben: 0,
    ausgaben_heute: 10,
    impressionen_heute: 500,
    aktive_anzeigen: 20,
    zeitzone: "Europe/Berlin",
    geprueft_am: MITTAG,
    ...over,
  }
}

describe("Konto-Prüfung", () => {
  it("kein Alarm, wenn seit einer Stunde Einblendungen dazukommen", () => {
    const vorher = stand({ geprueft_am: minus(MITTAG, 30), impressionen_heute: 450, verlauf: [{ t: minus(MITTAG, 60), i: 400 }] })
    const z = stand()
    expect(bewerte(z, vorher).alarm).toBeNull()
    expect(z.basis).toEqual({ impressionen: 400, geprueft_am: minus(MITTAG, 60) })
  })

  it("Alarm, wenn seit einer Stunde keine Einblendung dazukam, mit Grund Ausgabenlimit", () => {
    const vorher = stand({ geprueft_am: minus(MITTAG, 30), verlauf: [{ t: minus(MITTAG, 60), i: 500 }] })
    const z = stand({ ausgabenlimit: 100, ausgegeben: 100 })
    const { alarm } = bewerte(z, vorher)
    expect(alarm?.schluessel).toBe("offline")
    expect(alarm?.text).toContain("Ausgabenlimit ist erreicht")
  })

  it("Alarm bei gesperrtem Konto, aufgehoben sobald es wieder aktiv ist", () => {
    const z = stand({ kontostatus: 2 })
    const vorher = stand({ geprueft_am: minus(MITTAG, 30), kontostatus: 2 })
    expect(bewerte(z, vorher).alarm?.schluessel).toBe("konto-2")
    expect(bewerte(stand(), { ...vorher, kontostatus: 1 }).alarm).toBeNull()
  })

  it("vor 10 Uhr ohne Einblendungen noch kein Alarm", () => {
    const frueh = "2026-11-18T07:30:00.000Z" // 8:30 Uhr
    expect(bewerte(stand({ geprueft_am: frueh, impressionen_heute: 0 }), null).alarm).toBeNull()
    const zehn = "2026-11-18T09:30:00.000Z" // 10:30 Uhr
    expect(bewerte(stand({ geprueft_am: zehn, impressionen_heute: 0 }), null).alarm?.text).toBe("Heute wurde noch keine Anzeige ausgespielt.")
  })
})
