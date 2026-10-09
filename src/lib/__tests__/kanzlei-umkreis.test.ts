import { describe, expect, it } from "vitest"
import { buildKanzleiOptions, kanzleiDistanceKm } from "@/lib/kanzlei-umkreis"

const fields = [
  { key: "title", label: "Bezeichnung", hint: null, required: true, active: true, multiline: false, custom: false, group: null, defaultLabel: "" },
  { key: "aufgaben", label: "Aufgaben", hint: null, required: false, active: true, multiline: true, custom: false, group: null, defaultLabel: "" },
  { key: "teamgroesse", label: "Teamgröße", hint: null, required: false, active: true, multiline: false, custom: true, group: null, defaultLabel: "" },
]

describe("buildKanzleiOptions", () => {
  it("sammelt Standorte und Stellen je Kanzlei, auch ohne Kampagne", () => {
    const [k] = buildKanzleiOptions(
      [{ id: "k1", name: "Kanzlei", ort: "Bonn", lat: 50.73, lng: 7.1 }],
      [{ client_id: "k1", lat: 50.73, lng: 7.1 }, { client_id: "k1", lat: 51.0, lng: 7.0 }],
      [{ id: "p1", client_id: "k1", title: "StFA (m/w/d)", berufsbild: "steuerfachangestellte", ort: "Bonn", lat: null, lng: null, campaign_id: null, aufgaben: "Fibu", extra: { teamgroesse: "8" } }],
      fields
    )
    expect(k.places).toHaveLength(2)
    expect(k.positions[0].details).toEqual([
      { label: "Aufgaben", value: "Fibu" },
      { label: "Teamgröße", value: "8" },
    ])
    expect(kanzleiDistanceKm(k, 50.73, 7.1)).toBe(0)
  })

  it("Kanzlei ohne Standort hat keine Entfernung", () => {
    const [k] = buildKanzleiOptions([{ id: "k2", name: "Ohne", ort: null, lat: null, lng: null }], [], [], fields)
    expect(kanzleiDistanceKm(k, 50, 7)).toBeNull()
  })
})
