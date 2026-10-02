import { describe, expect, it } from "vitest"
import { mapLeadFormAnswers } from "./leadtable-form-answers"

const p = (entries: Record<string, string>) =>
  Object.fromEntries(Object.entries(entries).map(([title, value]) => [title, { title, value }]))

describe("mapLeadFormAnswers", () => {
  it("ordnet Meta-Formularfragen den Zusatzfeldern zu", () => {
    const r = mapLeadFormAnswers(
      p({
        full_name: "Nina He",
        email: "nina@example.com",
        "welche_ausbildung_hast_du_absolviert?": "eine_vergleichbare_qualifikation",
        "wann_können_wir_dich_am_besten_erreichen?": "nachmittags",
        "wie_viel_berufserfahrung_besitzt_du_in_diesem_bereich?": "0-2_jahre",
        adID: "1203",
        leadgenID: "458209926759109",
      })
    )
    expect(r.fields).toEqual({ ausbildung: "eine vergleichbare qualifikation", erreichbarkeit: "nachmittags" })
    expect(r.extras).toEqual([{ question: "Wie viel berufserfahrung besitzt du in diesem bereich?", answer: "0-2 jahre" }])
    expect(r.metaLeadId).toBe("458209926759109")
  })

  it("erkennt Wohnort mit PLZ und Alter & Wohnort", () => {
    expect(mapLeadFormAnswers(p({ "Wohnort (PLZ)": "Neuss 41464" }))).toMatchObject({ fields: { wohnort_plz: "Neuss 41464" }, plz: "41464" })
    expect(mapLeadFormAnswers(p({ "Alter & Wohnort": "34, 50667 Köln" }))).toMatchObject({
      fields: { alter: "34, 50667 Köln", wohnort_plz: "34, 50667 Köln" },
      plz: "50667",
    })
  })

  it("ordnet die Altformulare (Leadtable-Fragen) zu", () => {
    const r = mapLeadFormAnswers(
      p({
        Wechselgrund: "Insolvenz",
        "Wann kannst du bei uns starten?": "Zu sofort",
        "Wie viele AG in den letzten 5 Jahren?": "2",
        "Erfahrungen mit DATEV (offen dafür)?": "Ja",
        "Aktuell Steuerkanzlei?": "Nein",
        "Wie groß ist diese?": "15 MA",
        "Welche Branchen hat letzter AG betreut? ": "Alle",
        "Was erwartest du vom neuen AG?": "Homeoffice",
        "Welchen Bereich machst du am liebsten?": "FiBu",
      })
    )
    expect(r.fields).toEqual({
      wechselgrund: "Insolvenz",
      verfuegbar_ab: "Zu sofort",
      anzahl_ag_5_jahre: "2",
      datev_erfahrung: "Ja",
      aktuelle_steuerkanzlei: "Nein",
      kanzleigroesse: "15 MA",
      betreute_branchen: "Alle",
      erwartungen_neuer_ag: "Homeoffice",
      bevorzugter_bereich: "FiBu",
    })
    expect(r.extras).toEqual([])
  })

  it("überspringt leere Antworten und erkennt Meta-Test-Leads", () => {
    const r = mapLeadFormAnswers(p({ "Event ID": "", Erreichbarkeit: "--", "full name": "<test lead: dummy data for full name>" }))
    expect(r.fields).toEqual({})
    expect(r.isTestLead).toBe(true)
  })
})
