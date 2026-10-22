import { describe, expect, it } from "vitest"
import { sampleFeedDue, sampleFeedEnabled, SAMPLE_FEED_TOTAL } from "@/lib/sample-feed"
import { isUndeliverableAddress, SAMPLE_EMAIL_DOMAINS, sampleEmailDomain, samplePhone } from "@/lib/sample-contact"
import { sampleEmail } from "@/lib/sample-candidates"

describe("Beispielkandidaten für Live-Kunden (Paket 76)", () => {
  const live = "2026-10-21T08:00:00Z"
  const day = (n: number) => new Date(Date.parse(live) + n * 86_400_000)

  it("verteilt fünf über drei Monate: Tag 3, 21, 39, 57, 75", () => {
    expect(sampleFeedDue(live, day(2))).toBe(0)
    expect(sampleFeedDue(live, day(3))).toBe(1)
    expect(sampleFeedDue(live, day(20))).toBe(1)
    expect(sampleFeedDue(live, day(21))).toBe(2)
    expect(sampleFeedDue(live, day(75))).toBe(5)
    expect(sampleFeedDue(live, day(200))).toBe(SAMPLE_FEED_TOTAL)
  })

  it("läuft nur, wenn der Schalter auf 1 steht", () => {
    expect(sampleFeedEnabled(undefined)).toBe(false)
    expect(sampleFeedEnabled("")).toBe(false)
    expect(sampleFeedEnabled("0")).toBe(false)
    expect(sampleFeedEnabled(" 1 ")).toBe(true)
  })

  it("nimmt gängige Mailanbieter, außer eine eigene Domain ist eingestellt", () => {
    expect(SAMPLE_EMAIL_DOMAINS).toEqual(["gmail.com", "gmx.de", "yahoo.com", "freenet.de"])
    expect(sampleEmailDomain(() => 0, undefined)).toBe("gmail.com")
    expect(sampleEmailDomain(() => 0.99, "")).toBe("freenet.de")
    expect(sampleEmailDomain(() => 0, "bewerbung-kanzleistelle.de")).toBe("bewerbung-kanzleistelle.de")
    expect(sampleEmail("Jürgen", "Müller", () => 0.3)).toMatch(/^[a-z0-9.-]+@gmx\.de$/)
  })

  it("verschickt nichts an reservierte Domains und nimmt Nummern aus der Liste", () => {
    expect(isUndeliverableAddress("a.b@example.com")).toBe(true)
    expect(isUndeliverableAddress("a.b@kanzlei.de")).toBe(false)
    expect(samplePhone(() => 0, "+49 151 1111111, +49 151 2222222")).toBe("+49 151 1111111")
    expect(samplePhone(() => 0, "")).toBe("+49 30 23125 200")
  })
})
