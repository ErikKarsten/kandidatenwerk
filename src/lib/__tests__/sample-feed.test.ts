import { describe, expect, it } from "vitest"
import { sampleFeedDue, SAMPLE_FEED_TOTAL } from "@/lib/sample-feed"
import { isPublicMailDomain, isUndeliverableAddress, sampleEmailDomain, samplePhone } from "@/lib/sample-contact"
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

  it("nutzt nie öffentliche Mailanbieter für erfundene Personen", () => {
    expect(sampleEmailDomain(undefined)).toBe("example.com")
    expect(sampleEmailDomain("gmail.com")).toBe("example.com")
    expect(sampleEmailDomain("outlook.de")).toBe("example.com")
    expect(sampleEmailDomain("bewerbung-kanzleistelle.de")).toBe("bewerbung-kanzleistelle.de")
    expect(isPublicMailDomain("web.de")).toBe(true)
    expect(sampleEmail("Jürgen", "Müller", sampleEmailDomain("gmx.de"))).toBe("juergen.mueller@example.com")
  })

  it("verschickt nichts an reservierte Domains und nimmt Nummern aus der Liste", () => {
    expect(isUndeliverableAddress("a.b@example.com")).toBe(true)
    expect(isUndeliverableAddress("a.b@kanzlei.de")).toBe(false)
    expect(samplePhone(() => 0, "+49 151 1111111, +49 151 2222222")).toBe("+49 151 1111111")
    expect(samplePhone(() => 0, "")).toBe("+49 30 23125 200")
  })
})
