import { describe, expect, it } from "vitest"
import { jobTextHash, parseJobTextAnswer } from "./kanzleistelle-job-text"
import { buildJobDescription, buildRequirements } from "./kanzleistelle-profile-sync"

describe("Stellentext für Kanzleistelle24", () => {
  it("liest die JSON-Antwort und begrenzt die Punkte", () => {
    const r = parseJobTextAnswer(`{"aufgaben": ["- A", "B"], "anforderungen": [${Array.from({ length: 9 }, (_, i) => `"R${i}"`).join(",")}]}`)
    expect(r?.aufgaben).toEqual(["A", "B"])
    expect(r?.anforderungen).toHaveLength(7)
    expect(parseJobTextAnswer('{"aufgaben": [], "anforderungen": []}')).toBeNull()
  })

  it("Hash reagiert auf geänderte Anforderungen", () => {
    const base = { title: "StFA", aufgaben: "a", anforderungen: "keine Berufsanfänger" }
    expect(jobTextHash({ ...base, anforderungen: " keine Berufsanfänger " })).toBe(jobTextHash(base))
    expect(jobTextHash({ ...base, anforderungen: "5 Jahre" })).not.toBe(jobTextHash(base))
  })

  it("nutzt den aufbereiteten Text statt der Rohangaben", () => {
    const position = { aufgaben: "roh", anforderungen: "keine Berufsanfänger", berufserfahrung: "5 Jahre" }
    expect(buildRequirements(position, ["Mehrjährige Berufserfahrung"])).toBe("Mehrjährige Berufserfahrung")
    expect(buildRequirements(position)).toContain("keine Berufsanfänger")
    expect(buildJobDescription({ intro: "Wir" }, position, ["Jahresabschlüsse", "Lohn"])).toContain("• Jahresabschlüsse\n• Lohn")
  })
})
