import { describe, expect, it } from "vitest"
import { buildBenefits, buildJobDescription, buildJobPayload, employmentType, workingModel } from "./kanzleistelle-profile-sync"
import type { Database } from "@/types/database"

type Position = Database["public"]["Tables"]["client_positions"]["Row"]

const position = {
  id: "p1",
  client_id: "c1",
  title: "Steuerfachangestellte (m/w/d)",
  berufsbild: "steuerfachangestellte",
  plz: "50668",
  ort: "Köln",
  lat: 50.9,
  lng: 6.9,
  radius_km: 25,
  arbeitszeit: "Vollzeit oder Teilzeit ab 30 Std.",
  berufserfahrung: "ab 2 Jahre",
  software: "DATEV",
  gehalt: "45.000–52.000 € brutto/Jahr",
  startdatum: "ab sofort",
  anforderungen: "Abgeschlossene Ausbildung",
  aufgaben: "Finanz- und Lohnbuchhaltung",
  campaign_id: null,
  sort_order: 0,
  created_at: "",
  updated_at: "",
  kanzleistelle_job_id: null,
} as Position

describe("Kanzleistelle24-Anzeige aus dem Kanzleiprofil", () => {
  it("leitet Arbeitszeit und Arbeitsmodell ab", () => {
    expect(employmentType("Vollzeit oder Teilzeit")).toBe("vollzeit")
    expect(employmentType("Teilzeit 20 Std.")).toBe("teilzeit")
    expect(workingModel("2 Tage pro Woche")).toBe("hybrid")
    expect(workingModel("nein")).toBe("vor_ort")
    expect(workingModel(null)).toBe("vor_ort")
  })

  it("baut die Beschreibung nur aus Über uns und Aufgaben", () => {
    const text = buildJobDescription(
      { intro: "Wir sind eine moderne Kanzlei.", benefits: ["Jobrad"] },
      { ...position, aufgaben: "Finanzbuchhaltung\nLohnbuchhaltung" }
    )
    expect(text).toBe("🏢 Über uns\n\nWir sind eine moderne Kanzlei.\n\n📋 Ihre Aufgaben\n\n• Finanzbuchhaltung\n• Lohnbuchhaltung")
  })

  it("führt Benefits, Arbeitszeiten und Homeoffice als Benefits", () => {
    expect(buildBenefits({ benefits: ["Jobrad", " "], arbeitszeiten: "Gleitzeit", homeoffice: "2 Tage" })).toEqual([
      "Jobrad",
      "Arbeitszeiten: Gleitzeit",
      "Homeoffice: 2 Tage",
    ])
  })

  it("füllt die Anzeige mit Ort, Gehalt und Firma", () => {
    const payload = buildJobPayload({ name: "Kanzlei Muster" }, { intro: "Intro", benefits: [] }, position, "co1")
    expect(payload).toMatchObject({
      title: "Steuerfachangestellte (m/w/d)",
      company: "Kanzlei Muster",
      company_id: "co1",
      location: "50668 Köln",
      postal_code: "50668",
      salary_min: null,
      salary_max: null,
      salary_range: null,
      status: "published",
      is_active: true,
    })
  })
})
