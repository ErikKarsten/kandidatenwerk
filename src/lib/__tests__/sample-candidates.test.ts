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
