import { describe, expect, it } from "vitest"
import { isOnboardingStatus, payloadFromAnswer, payloadFromLead, positionOf } from "./close-onboarding"
import { activityTypeOf, customActivityText } from "./close-sync"

describe("Übernahme aus Close", () => {
  it("erkennt die auslösenden Status (inkl. Tippfehler in Close)", () => {
    expect(isOnboardingStatus("Gewonnen")).toBe(true)
    expect(isOnboardingStatus("Folgebescprechung zum SC vereinbart (Angebot verschickt)")).toBe(true)
    expect(isOnboardingStatus("Folgebesprechung zum SC vereinbart (Angebot verschickt)")).toBe(true)
    expect(isOnboardingStatus("SC Terminiert")).toBe(false)
    expect(isOnboardingStatus(null)).toBe(false)
  })

  it("übernimmt Stammdaten aus dem Lead", () => {
    const p = payloadFromLead(
      {
        id: "lead_1",
        display_name: "Muster Steuerberatung",
        url: "https://muster.de",
        addresses: [{ address_1: "Hauptstr. 1", zipcode: "50667", city: "Köln" }],
        contacts: [{ name: "Anna Muster", title: "Partnerin", emails: [{ email: "anna@muster.de" }], phones: [{ phone: "+49 221 1" }] }],
      },
      "Gewonnen"
    )
    expect(p).toMatchObject({ close_lead_id: "lead_1", firma: "Muster Steuerberatung", plz: "50667", ort: "Köln", ansprechpartner_name: "Anna Muster", close_status: "Gewonnen" })
  })

  it("nimmt den ersten Kontakt mit E-Mail als Hauptkontakt", () => {
    const p = payloadFromLead(
      {
        id: "lead_2",
        display_name: "Aupperle & Partner",
        contacts: [
          { name: "Ulrich Aupperle", title: "Herr", emails: [], phones: [{ phone: "+49 1" }] },
          { name: "Manuel Aupperle", title: "Herr", emails: [{ email: "info@aupperle.de" }], phones: [] },
        ],
      },
      "Gewonnen"
    )
    expect(p).toMatchObject({ ansprechpartner_name: "Manuel Aupperle", email: "info@aupperle.de", telefon: "+49 1" })
    expect(p.ansprechpartner_position).toBeUndefined()
  })

  it("liest die KI-Antwort nur mit bekannten Feldern", () => {
    const p = payloadFromAnswer(
      'Hier: {"profil": {"intro": "Wir sind ...", "erfunden": "x", "ansprechpartner_bewerbung": "Frau X", "vertriebsnotizen": "Termin Portaleinweisung", "painpoints": "Keine Berufsanfänger"}, "benefits": ["Firmenwagen nach Absprache"], "laufzeit_monate": "12", "vertragsstart": "2026-11-01", "stellen": [{"titel": "StFA (m/w/d)", "berufsbild": "steuerfachangestellte", "aufgaben": "a\\nb"}, {"berufsbild": "x"}]}'
    ) as Record<string, unknown>
    expect(p.intro).toBe("Wir sind ...")
    expect(p.painpoints).toBe("Keine Berufsanfänger")
    expect(p.erfunden).toBeUndefined()
    expect(p.benefits).toEqual(["Firmenwagen nach Absprache"])
    // Vertragsstart, Laufzeit und Ansprechpartner pflegt der KAM von Hand.
    expect(p.laufzeit_monate).toBeUndefined()
    expect(p.vertragsstart).toBeUndefined()
    expect(p.ansprechpartner_bewerbung).toBeUndefined()
    expect(p.vertriebsnotizen).toBeUndefined()
    expect(p.stellen_json).toEqual([{ titel: "StFA (m/w/d)", berufsbild: "steuerfachangestellte", aufgaben: "a\nb" }])
    expect(payloadFromAnswer("kein JSON")).toEqual({})
  })
})

describe("Ansprechpartner aus Close", () => {
  it("übernimmt keine Anrede als Position", () => {
    expect(positionOf("Herr")).toBeUndefined()
    expect(positionOf("Frau")).toBeUndefined()
    expect(positionOf("Partnerin")).toBe("Partnerin")
  })
})

describe("Close-Aktivitäten", () => {
  it("ordnet Arten zu", () => {
    expect(activityTypeOf({ _type: "Call" })).toBe("call")
    expect(activityTypeOf({ _type: "LeadStatusChange" })).toBe("status")
    expect(activityTypeOf({ _type: "Email" })).toBeNull()
  })

  it("macht eigene Aktivitäten lesbar", () => {
    const text = customActivityText(
      { _type: "CustomActivity", id: "a", "custom.cf_1": "Ja", "custom.cf_2": ["DATEV", "Addison"], "custom.cf_3": null, "custom.cf_4": "" },
      new Map([["cf_1", "Budget vorhanden"], ["cf_2", "Software"]])
    )
    expect(text).toBe("Budget vorhanden: Ja\nSoftware: DATEV, Addison")
  })
})

describe("Kommentare erst ab Gewonnen", () => {
  it("Folgebesprechung bekommt noch keine Kommentare", async () => {
    const { closeStatusAllowsComments } = await import("./close-sync")
    expect(closeStatusAllowsComments("Gewonnen")).toBe(true)
    expect(closeStatusAllowsComments(null)).toBe(true)
    expect(closeStatusAllowsComments("Folgebesprechung zum SC vereinbart")).toBe(false)
  })
})
