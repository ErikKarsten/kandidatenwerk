import { describe, expect, it } from "vitest"
import { buildWerdegangPrompt, cleanWerdegang, parseWerdegang } from "@/lib/cv-werdegang"

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
    const prompt = buildWerdegangPrompt({ berufsbild: "steuerfachangestellte", custom_fields: { ausbildung: "StFA 2019" }, notes: "Mail an max@example.com, Tel. 0151 1234567", cv_werdegang: null }, 2026)
    expect(prompt).toContain("Steuerfachangestellte")
    expect(prompt).toContain("2016 bis heute")
    expect(prompt).not.toContain("max@example.com")
    expect(prompt).not.toContain("1234567")
  })
})
