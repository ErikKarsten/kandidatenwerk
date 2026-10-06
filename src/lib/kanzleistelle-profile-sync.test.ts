import { describe, expect, it } from "vitest"
import { buildJobDescription, buildJobPayload, employmentType, parseSalary, workingModel } from "./kanzleistelle-profile-sync"
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
  it("liest Gehaltsspannen und Monatsgehälter", () => {
    expect(parseSalary("45.000–52.000 € brutto/Jahr")).toEqual({ min: 45000, max: 52000 })
    expect(parseSalary("ab 3.500 € im Monat")).toEqual({ min: 42000, max: null })
    expect(parseSalary("55k - 62k")).toEqual({ min: 55000, max: 62000 })
    expect(parseSalary("nach Vereinbarung")).toEqual({ min: null, max: null })
  })

  it("leitet Arbeitszeit und Arbeitsmodell ab", () => {
    expect(employmentType("Vollzeit oder Teilzeit")).toBe("vollzeit")
    expect(employmentType("Teilzeit 20 Std.")).toBe("teilzeit")
    expect(workingModel("2 Tage pro Woche")).toBe("hybrid")
    expect(workingModel("nein")).toBe("vor_ort")
    expect(workingModel(null)).toBe("vor_ort")
  })

  it("baut die Beschreibung aus Intro, Aufgaben, Profil und Angebot", () => {
    const text = buildJobDescription({ intro: "Wir sind eine moderne Kanzlei.", benefits: ["Jobrad"], homeoffice: "2 Tage" }, position)
    expect(text).toContain("🏢 Über uns\n\nWir sind eine moderne Kanzlei.")
    expect(text).toContain("📋 Ihre Aufgaben\n\nFinanz- und Lohnbuchhaltung")
    expect(text).toContain("Software: DATEV")
    expect(text).toContain("✅ Jobrad")
    expect(text).toContain("💶 Gehalt: 45.000–52.000 € brutto/Jahr")
  })

  it("füllt die Anzeige mit Ort, Gehalt und Firma", () => {
    const payload = buildJobPayload({ name: "Kanzlei Muster" }, { intro: "Intro", benefits: [] }, position, "co1")
    expect(payload).toMatchObject({
      title: "Steuerfachangestellte (m/w/d)",
      company: "Kanzlei Muster",
      company_id: "co1",
      location: "50668 Köln",
      postal_code: "50668",
      salary_min: 45000,
      salary_max: 52000,
      status: "published",
      is_active: true,
    })
  })
})
