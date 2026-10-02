import { describe, expect, it } from "vitest"
import { extractLeadFormId, mapMetaStatus, parseGeoLocations } from "@/lib/meta-campaigns-parse"

describe("parseGeoLocations", () => {
  it("liest Städte ohne Koordinaten, Orte und eigene Pins mit Koordinaten", () => {
    const areas = parseGeoLocations({
      cities: [{ key: "579270", name: "Munich", radius: 35, distance_unit: "kilometer" }],
      places: [{ key: "104270781319694", name: "Stuttgart", latitude: 48.8, longitude: 9.16, radius: 30, distance_unit: "kilometer" }],
      custom_locations: [{ latitude: 52.1, longitude: 10.2, radius: 10, distance_unit: "mile", name: "Pin" }],
    })
    expect(areas).toHaveLength(3)
    expect(areas[0]).toMatchObject({ areaType: "city", areaKey: "579270", lat: null, radiusKm: 35 })
    expect(areas[1]).toMatchObject({ areaType: "place", lat: 48.8, lng: 9.16, radiusKm: 30 })
    expect(areas[2]).toMatchObject({ areaType: "custom_location", radiusKm: 16.1 })
  })

  it("löst PLZ-Targeting über die lokale PLZ-Liste auf", () => {
    const [zip] = parseGeoLocations({ zips: [{ key: "DE:38100", name: "38100" }] })
    expect(zip.areaType).toBe("zip")
    expect(zip.lat).toBeCloseTo(52.26, 1)
    expect(zip.radiusKm).toBeNull()
  })

  it("übernimmt Länder und Regionen ohne Kreis", () => {
    const areas = parseGeoLocations({ countries: ["DE"], regions: [{ key: "826", name: "Bayern" }] })
    expect(areas.map((a) => [a.areaType, a.label, a.lat])).toEqual([
      ["region", "Bayern", null],
      ["country", "Deutschland", null],
    ])
  })

  it("kommt mit fehlendem Targeting zurecht", () => {
    expect(parseGeoLocations(undefined)).toEqual([])
  })
})

describe("mapMetaStatus", () => {
  it.each([
    ["ACTIVE", "active"],
    ["PAUSED", "paused"],
    ["CAMPAIGN_PAUSED", "paused"],
    ["ARCHIVED", "completed"],
    ["DELETED", "completed"],
    [undefined, "completed"],
  ])("%s -> %s", (input, expected) => {
    expect(mapMetaStatus(input)).toBe(expected)
  })
})

describe("extractLeadFormId", () => {
  it("findet die Formular-ID in object_story_spec und asset_feed_spec", () => {
    expect(extractLeadFormId({ object_story_spec: { link_data: { call_to_action: { value: { lead_gen_form_id: "2126003811353294" } } } } })).toBe("2126003811353294")
    expect(extractLeadFormId({ asset_feed_spec: { call_to_actions: [{ value: { lead_gen_form_id: 123 } }] } })).toBe("123")
  })

  it("liefert null ohne Formular", () => {
    expect(extractLeadFormId({ object_story_spec: {} })).toBeNull()
    expect(extractLeadFormId(undefined)).toBeNull()
  })
})
