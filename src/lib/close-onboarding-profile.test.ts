import { beforeEach, describe, expect, it, vi } from "vitest"

// Paket 95: Eine kaputte oder leere KI-Antwort wird zum Fehler, damit der Cronjob es erneut
// versucht - vorher galt die Übernahme still als erledigt und das Kanzleiprofil blieb leer.
const llm = vi.hoisted(() => ({ answer: "" }))
vi.mock("@/lib/llm", () => ({ generateText: vi.fn(async () => llm.answer) }))

import { extractProfileFromSources } from "./close-onboarding"

const longCall = { label: "Close: Telefonat (Transkript)", text: "Wir sind eine Kanzlei mit zehn Mitarbeitern. ".repeat(100) }

describe("Kanzleiprofil aus Close: KI-Antwort prüfen (Paket 95)", () => {
  beforeEach(() => {
    llm.answer = ""
  })

  it("übernimmt eine lesbare Antwort", async () => {
    llm.answer = '```json\n{"profil": {"mitarbeiterzahl": "ca. 10"}, "benefits": [], "stellen": []}\n```'
    await expect(extractProfileFromSources("Kanzlei", [longCall])).resolves.toMatchObject({ mitarbeiterzahl: "ca. 10" })
  })

  it("meldet eine nicht lesbare Antwort als Fehler", async () => {
    llm.answer = '{"profil": {"intro": "abgebrochen'
    await expect(extractProfileFromSources("Kanzlei", [longCall])).rejects.toThrow(/nicht lesbar/)
  })

  it("meldet eine leere Antwort trotz langer Gespräche als Fehler", async () => {
    llm.answer = '{"profil": {}, "benefits": [], "stellen": []}'
    await expect(extractProfileFromSources("Kanzlei", [longCall])).rejects.toThrow(/ohne Angaben/)
  })

  it("akzeptiert eine leere Antwort, wenn es kaum Quellen gibt", async () => {
    llm.answer = '{"profil": {}, "benefits": [], "stellen": []}'
    await expect(extractProfileFromSources("Kanzlei", [{ label: "Close: Lead-Felder", text: "Ort: Bonn" }])).resolves.toEqual({ benefits: [], stellen_json: [] })
  })
})
