import { describe, expect, it } from "vitest"
import { campaignCandidates, type AutomationData, type CampaignJoin, type CandidateRow } from "./run-automations"

// Paket 94: Kandidaten werden für alle Automatisierungen auf einmal geladen und dann je
// Automatisierung im Speicher ausgewählt - gleiche Auswahl wie vorher je Kampagne.

const cand = (id: string, status: string): CandidateRow => ({
  id,
  first_name: id,
  last_name: "",
  email: `${id}@gmx.de`,
  phone: null,
  status,
  client_id: null,
  created_at: "2026-10-01T00:00:00Z",
  berufsbild: null,
  tags: [],
})

const lead: CampaignJoin = { id: "lead", title: "KS24 – SFA", kind: "lead", client_id: null, clients: null }
const kanzlei: CampaignJoin = { id: "k1", title: "Steuerfachangestellte*r", kind: "kanzlei", client_id: "cl1", clients: { name: "Kanzlei" } }

function data(): AutomationData {
  const own1 = cand("own1", "neu")
  const own2 = cand("own2", "vorqualifiziert")
  const pool = cand("pool", "vorqualifiziert")
  const kOwn = cand("kOwn", "vorqualifiziert")
  return {
    own: new Map([
      ["lead", [own1, own2]],
      ["k1", [kOwn]],
    ]),
    assigned: new Map([["k1", new Map([["pool", "2026-10-20T10:00:00Z"], ["kOwn", "2026-10-21T10:00:00Z"]])]]),
    candidates: new Map([own1, own2, pool, kOwn].map((c) => [c.id, c])),
    fired: new Set(),
  }
}

describe("Automatisierungen: Kandidaten je Kampagne (Paket 94)", () => {
  it("Lead-Kampagne: alle Beworbenen, bei Statusänderung nur im Zielstatus", () => {
    expect(campaignCandidates(data(), lead, "new_lead", null, new Map()).map((c) => c.id)).toEqual(["own1", "own2"])
    expect(campaignCandidates(data(), lead, "status_change", "vorqualifiziert", new Map()).map((c) => c.id)).toEqual(["own2"])
  })

  it("Kanzlei-Kampagne: Zugeordnete mit Zeitpunkt der Zuordnung, auch aus dem Pool", () => {
    const joinedAt = new Map<string, string>()
    const ids = campaignCandidates(data(), kanzlei, "client_assigned", null, joinedAt).map((c) => c.id)
    expect(ids.sort()).toEqual(["kOwn", "pool"])
    expect(joinedAt.get("pool")).toBe("2026-10-20T10:00:00Z")
  })

  it("Kanzlei-Kampagne mit Statusänderung: eigene und zugeordnete im Zielstatus", () => {
    const d = data()
    d.own.set("k1", [...d.own.get("k1")!, cand("kNeu", "neu")])
    const ids = campaignCandidates(d, kanzlei, "status_change", "vorqualifiziert", new Map()).map((c) => c.id)
    expect(ids.sort()).toEqual(["kOwn", "pool"])
  })

  it("überspringt Zugeordnete, die nicht geladen wurden (z. B. Demo-Kandidaten)", () => {
    const d = data()
    d.assigned.get("k1")!.set("demo", "2026-10-22T10:00:00Z")
    expect(campaignCandidates(d, kanzlei, "client_assigned", null, new Map()).map((c) => c.id)).not.toContain("demo")
  })
})
