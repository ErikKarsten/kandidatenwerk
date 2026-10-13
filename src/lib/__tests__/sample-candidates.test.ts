import { describe, expect, it } from "vitest"
import { parseSampleAnswer, pickSamplePeople, sampleEmail } from "@/lib/sample-candidates"
import { geocodePlz } from "@/lib/geocode-plz"
import { haversineDistanceKm } from "@/lib/geo-distance"

describe("pickSamplePeople", () => {
  it("wählt drei Wohnorte im Umkreis von 15 km", () => {
    const people = pickSamplePeople("20095")
    const center = geocodePlz("20095")!
    expect(people).toHaveLength(3)
    for (const p of people) {
      const c = geocodePlz(p.plz)!
      expect(haversineDistanceKm(center.lat, center.lng, c.lat, c.lng)).toBeLessThanOrEqual(15)
      expect(["weiblich", "männlich"]).toContain(p.geschlecht)
      expect(p.herkunft).toBeTruthy()
      expect(p.software).toBe("DATEV")
      expect(p.allrounder).toBe(false)
    }
    expect(new Set(people.map((p) => p.plz)).size).toBe(3)
  })

  it("lehnt unbekannte PLZ ab", () => {
    expect(() => pickSamplePeople("00000")).toThrow()
  })
})

describe("parseSampleAnswer", () => {
  it("liest die Kandidaten und nur bekannte Felder", () => {
    const text = 'Hier: {"kandidaten": [{"first_name": "Lena", "last_name": "Vogel", "beschreibung": "Kurz.", "offene_fragen": "- Homeoffice?", "felder": {"alter": 31, "unbekannt": "x"}}]}'
    const [c] = parseSampleAnswer(text, 1)
    expect(c.first_name).toBe("Lena")
    expect(c.felder).toEqual({ alter: "31" })
  })

  it("verlangt genug Kandidaten", () => {
    expect(() => parseSampleAnswer('{"kandidaten": []}', 3)).toThrow()
  })
})

describe("sampleEmail", () => {
  it("baut eine Adresse auf example.com ohne Umlaute", () => {
    expect(sampleEmail("Jürgen", "Müller-Weiß")).toBe("juergen.mueller-weiss@example.com")
  })
})

describe("buildSamplePrompt", () => {
  const person = { plz: "53111", geschlecht: "weiblich" as const, herkunft: "türkisch", software: "DATEV" as const, allrounder: false }

  it("nimmt gewählte Schwerpunkte auf, sonst nicht", async () => {
    const { buildSamplePrompt } = await import("@/lib/sample-candidates")
    expect(buildSamplePrompt("Steuerfachangestellte", [person], { focus: ["Lohnbuchhaltung", "Jahresabschlüsse"] })).toContain("Fachliche Schwerpunkte: Lohnbuchhaltung, Jahresabschlüsse")
    expect(buildSamplePrompt("Steuerfachangestellte", [person])).not.toContain("Fachliche Schwerpunkte")
  })

  it("gibt Namensherkunft, Software, Kanzlei-Erfahrung und Steuerfachwirt vor", async () => {
    const { buildSamplePrompt } = await import("@/lib/sample-candidates")
    const prompt = buildSamplePrompt("Lohnbuchhalter", [person, { ...person, software: "ADDISON" as const }])
    expect(prompt).toContain("Namensherkunft: türkisch, Kanzleisoftware: DATEV")
    expect(prompt).toContain("Kanzleisoftware: ADDISON")
    expect(prompt).toContain("DATEV Unternehmen online")
    expect(prompt).toContain("ausschließlich in Steuerkanzleien")
    expect(prompt).toContain("Keine Branchen")
    expect(prompt).toContain("zum Steuerfachwirt, nie zum Bilanzbuchhalter")
    expect(prompt).not.toContain("betreute_branchen")
    expect(prompt).not.toContain("Allrounder haben")
  })

  it("Allrounder decken alle Bereiche ab, Zusatzinfos und vergebene Namen fließen ein", async () => {
    const { buildSamplePrompt } = await import("@/lib/sample-candidates")
    const prompt = buildSamplePrompt("Steuerfachangestellte", [{ ...person, allrounder: true }], { extra: "Teilzeit gewünscht", avoidNames: ["Ayşe Demir"] })
    expect(prompt).toContain("Kanzleisoftware: DATEV, Allrounder")
    expect(prompt).toContain("Allrounder haben Erfahrung in allen Bereichen (Lohnbuchhaltung, Jahresabschlüsse, Finanzbuchhaltung, Steuererklärungen)")
    expect(prompt).toContain("Zusätzliche Vorgaben des Vertriebs (unbedingt berücksichtigen): Teilzeit gewünscht")
    expect(prompt).toContain("nicht wiederholen: Ayşe Demir")
  })
})

describe("pickNameOrigin", () => {
  it("verteilt grob wie die Bevölkerung - überwiegend, aber nicht nur deutsch", async () => {
    const { pickNameOrigin } = await import("@/lib/sample-candidates")
    let seed = 1
    const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
    const origins = Array.from({ length: 2000 }, () => pickNameOrigin(random))
    const german = origins.filter((o) => o === "deutsch").length / origins.length
    expect(german).toBeGreaterThan(0.55)
    expect(german).toBeLessThan(0.72)
    expect(new Set(origins).size).toBeGreaterThan(10)
  })
})

describe("parseSampleAnswer mit Werdegang", () => {
  it("übernimmt und bereinigt den Werdegang", () => {
    const text = JSON.stringify({ kandidaten: [{ first_name: "Emre", last_name: "Kaya", werdegang: "**2020 – heute · Steuerfachangestellter · Steuerkanzlei, ca. 12 Mitarbeitende**\n• Finanzbuchhaltung" }] })
    const [c] = parseSampleAnswer(text, 1)
    expect(c.werdegang).toBe("2020 – heute · Steuerfachangestellter · Steuerkanzlei, ca. 12 Mitarbeitende\n- Finanzbuchhaltung")
  })
})

describe("cleanFocus", () => {
  it("lässt nur bekannte Schwerpunkte zu", async () => {
    const { cleanFocus } = await import("@/lib/sample-focus")
    expect(cleanFocus(["Lohnbuchhaltung", "Hacking", "Steuererklärungen"])).toEqual(["Lohnbuchhaltung", "Steuererklärungen"])
    expect(cleanFocus("x")).toEqual([])
  })
})

describe("cleanSoftware und cleanExtra", () => {
  it("lässt nur bekannte Software zu (Standard DATEV) und kürzt Zusatzinfos", async () => {
    const { cleanSoftware, cleanExtra, SAMPLE_EXTRA_MAX } = await import("@/lib/sample-focus")
    expect(cleanSoftware("Agenda")).toBe("Agenda")
    expect(cleanSoftware("Lexware")).toBe("DATEV")
    expect(cleanExtra("  Teilzeit  ")).toBe("Teilzeit")
    expect(cleanExtra("x".repeat(SAMPLE_EXTRA_MAX + 50))).toHaveLength(SAMPLE_EXTRA_MAX)
    expect(cleanExtra(42)).toBe("")
  })
})

