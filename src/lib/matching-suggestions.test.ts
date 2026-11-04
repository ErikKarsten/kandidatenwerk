import { describe, expect, it } from "vitest"
import { computeSuggestions, type MatchCampaign, type MatchCandidate, type MatchingInput } from "./matching-suggestions"
import { buildDigestHtml, isDigestSlot } from "./cron/matching-digest"

// Paket 96: Matching-Übersicht - wer taucht bei welcher Kampagne auf?
// Köln Mitte (50667) und Bonn (53111) liegen ca. 25 km auseinander.
const KOELN = { lat: 50.9384, lng: 6.9584 }
const BONN = { lat: 50.7374, lng: 7.0982 }

const candidate = (over: Partial<MatchCandidate> = {}): MatchCandidate => ({
  id: "k1",
  first_name: "Anna",
  last_name: "Muster",
  email: null,
  plz: "50667",
  ...KOELN,
  berufsbild: "steuerfachangestellte",
  source: "meta_ads",
  created_at: "2026-11-01T10:00:00Z",
  ...over,
})

const campaign = (over: Partial<MatchCampaign> = {}): MatchCampaign => ({
  id: "c1",
  title: "Steuerfachangestellte Köln",
  client_id: "kanzlei1",
  berufsbild: "steuerfachangestellte",
  plz: "50667",
  ...KOELN,
  radius_km: 30,
  extra_plz: [],
  ...over,
})

const input = (over: Partial<MatchingInput> = {}): MatchingInput => ({
  candidates: [candidate()],
  campaigns: [campaign()],
  liveClients: new Map([["kanzlei1", "Kanzlei Eins"]]),
  clientNames: new Map([["kanzlei1", "Kanzlei Eins"]]),
  assignments: [],
  rows: [],
  ...over,
})

describe("computeSuggestions (Paket 96)", () => {
  it("schlägt passende Kandidaten im Umkreis vor", () => {
    const pairs = computeSuggestions(input())
    expect(pairs).toEqual([{ candidateId: "k1", campaignId: "c1", distanceKm: 0 }])
  })

  it("prüft Berufsbild und Umkreis", () => {
    expect(computeSuggestions(input({ candidates: [candidate({ berufsbild: "lohnbuchhalter" })] }))).toEqual([])
    expect(computeSuggestions(input({ candidates: [candidate({ ...BONN })], campaigns: [campaign({ radius_km: 10 })] }))).toEqual([])
    expect(computeSuggestions(input({ candidates: [candidate({ ...BONN })], campaigns: [campaign({ radius_km: 30 })] }))).toHaveLength(1)
  })

  it("zählt den nächsten Standort der Kampagne", () => {
    const pairs = computeSuggestions(input({ candidates: [candidate({ ...BONN })], campaigns: [campaign({ radius_km: 10, extra_plz: ["53111"] })] }))
    expect(pairs).toHaveLength(1)
  })

  it("nur Kanzleien in der Phase Live", () => {
    expect(computeSuggestions(input({ liveClients: new Map() }))).toEqual([])
  })

  it("nicht, wenn der Kandidat schon einmal bei dieser Kanzlei war - auch zurückgezogen", () => {
    const removed = { candidate_id: "k1", client_id: "kanzlei1", status: "nein", removed_at: "2026-10-01T00:00:00Z" }
    expect(computeSuggestions(input({ assignments: [removed] }))).toEqual([])
  })

  it("auch wenn er schon bei einer anderen Kanzlei läuft, aber nicht wenn er eingestellt wurde", () => {
    const elsewhere = { candidate_id: "k1", client_id: "kanzlei2", status: "vg", removed_at: null }
    expect(computeSuggestions(input({ assignments: [elsewhere] }))).toHaveLength(1)
    expect(computeSuggestions(input({ assignments: [{ ...elsewhere, status: "ja" }] }))).toEqual([])
  })

  it("'Nicht vorschlagen' gilt nur für diese Kampagne", () => {
    const rows = [{ candidate_id: "k1", campaign_id: "c1", first_seen_at: "", notified_at: null, dismissed_at: "2026-11-02T00:00:00Z" }]
    const campaigns = [campaign(), campaign({ id: "c2", title: "Zweite Stelle" })]
    expect(computeSuggestions(input({ rows, campaigns })).map((p) => p.campaignId)).toEqual(["c2"])
  })
})

describe("Sammel-Mail Mo + Do (Paket 96)", () => {
  it("nur montags und donnerstags ab 8 Uhr deutscher Zeit", () => {
    expect(isDigestSlot(new Date("2026-11-05T07:00:00Z"))).toBe(true) // Do 8:00 Winterzeit
    expect(isDigestSlot(new Date("2026-11-05T06:00:00Z"))).toBe(false) // Do 7:00
    expect(isDigestSlot(new Date("2026-11-02T10:00:00Z"))).toBe(true) // Mo 11:00
    expect(isDigestSlot(new Date("2026-11-02T11:00:00Z"))).toBe(false) // Mo 12:00
    expect(isDigestSlot(new Date("2026-11-04T07:00:00Z"))).toBe(false) // Mi
    expect(isDigestSlot(new Date("2026-06-04T06:00:00Z"))).toBe(true) // Do 8:00 Sommerzeit
  })

  it("listet die Kampagnen mit der Anzahl neuer Vorschläge", () => {
    const html = buildDigestHtml(
      [
        { candidateId: "k1", campaignId: "c1", distanceKm: 1 },
        { candidateId: "k2", campaignId: "c1", distanceKm: 2 },
      ],
      5,
      { campaigns: [campaign()], liveClients: new Map([["kanzlei1", "Kanzlei <Eins>"]]) }
    )
    expect(html).toContain("2 neue Matching-Vorschläge")
    expect(html).toContain("Kanzlei &lt;Eins&gt; – Steuerfachangestellte Köln")
    expect(html).toContain("Insgesamt 5 offene Vorschläge")
    expect(html).toContain("/dashboard/matching")
  })
})
