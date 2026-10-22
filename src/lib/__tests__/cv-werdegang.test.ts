import { describe, expect, it } from "vitest"
import { buildWerdegangPrompt, cleanWerdegang, parseWerdegang, stationHeading, werdegangInputHash } from "@/lib/cv-werdegang"

describe("parseWerdegang", () => {
  it("teilt in Stationen mit Aufgaben", () => {
    const st = parseWerdegang("seit 2021 · Steuerfachangestellte · Steuerkanzlei\n- Finanzbuchhaltung\n- Jahresabschlüsse\n\n2018 – 2021 · Ausbildung\n- Lohnabrechnung")
    expect(st).toEqual([
      { heading: "seit 2021 · Steuerfachangestellte · Steuerkanzlei", tasks: ["Finanzbuchhaltung", "Jahresabschlüsse"] },
      { heading: "2018 – 2021 · Ausbildung", tasks: ["Lohnabrechnung"] },
    ])
  })
})

describe("cleanWerdegang", () => {
  it("entfernt Markdown und vereinheitlicht Stichpunkte", () => {
    expect(cleanWerdegang("**seit 2021 · StFA**\n• Fibu\n* Lohn\n\n\n\n2018")).toBe("seit 2021 · StFA\n- Fibu\n- Lohn\n\n2018")
  })
})

describe("buildWerdegangPrompt", () => {
  it("gibt keine Kontaktdaten an die KI", () => {
    const prompt = buildWerdegangPrompt({ berufsbild: "steuerfachangestellte", custom_fields: { ausbildung: "StFA 2019" }, notes: "Mail an max@example.com, Tel. 0151 1234567" }, 2026)
    expect(prompt).toContain("Steuerfachangestellte")
    expect(prompt).toContain("2016 bis heute")
    expect(prompt).not.toContain("max@example.com")
    expect(prompt).not.toContain("1234567")
  })
})

describe("Werdegang vollständig und anonymisiert (Paket 82)", () => {
  const line = "05/2022 – aktuell · Steuerfachangestellter · Steuerkanzlei, ca. 10 Mitarbeitende ‖ Steuerkanzlei Maus, Merzenich"

  it("zeigt anonymisiert den neutralen, vollständig den genannten Arbeitgeber", () => {
    expect(stationHeading(line, true)).toBe("05/2022 – aktuell · Steuerfachangestellter · Steuerkanzlei, ca. 10 Mitarbeitende")
    expect(stationHeading(line, false)).toBe("05/2022 – aktuell · Steuerfachangestellter · Steuerkanzlei Maus, Merzenich")
    expect(stationHeading("2018 – 2021 · Ausbildung · Steuerkanzlei", false)).toBe("2018 – 2021 · Ausbildung · Steuerkanzlei")
    expect(parseWerdegang(`${line}\n- Fibu`, false)[0]).toEqual({ heading: "05/2022 – aktuell · Steuerfachangestellter · Steuerkanzlei Maus, Merzenich", tasks: ["Fibu"] })
  })

  it("merkt, wenn sich die Angaben ändern", () => {
    const base = { berufsbild: "steuerfachangestellte", custom_fields: { alter: "51" }, notes: "Werdegang: …" }
    expect(werdegangInputHash(base)).toBe(werdegangInputHash({ ...base, custom_fields: { alter: "51", gehaltsvorstellung: "50000" } }))
    expect(werdegangInputHash(base)).not.toBe(werdegangInputHash({ ...base, notes: "Werdegang: … neue Station" }))
  })

  it("nimmt den alten Werdegang nicht als Quelle und lässt lange Notizen ganz", () => {
    const prompt = buildWerdegangPrompt({ berufsbild: "steuerfachangestellte", custom_fields: {}, notes: `${"x".repeat(5000)} Station am Ende` }, 2026)
    expect(prompt).toContain("Station am Ende")
    expect(prompt).not.toContain("Vom Team erfasster Werdegang")
  })
})
