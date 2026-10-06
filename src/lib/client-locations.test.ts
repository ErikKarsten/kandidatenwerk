import { describe, expect, it } from "vitest"
import { parseLocationsFromText } from "./client-locations"

describe("parseLocationsFromText", () => {
  it("findet alle Standorte in einem Freitext", () => {
    expect(parseLocationsFromText("Laiberstr. 32, 72160 Horb; 50668 Köln und 38100 Braunschweig")).toEqual([
      { plz: "72160", ort: "Horb" },
      { plz: "50668", ort: "Köln" },
      { plz: "38100", ort: "Braunschweig" },
    ])
  })

  it("nimmt mehrteilige Orte mit und erkennt PLZ ohne Ort", () => {
    expect(parseLocationsFromText("21244 Buchholz in der Nordheide, sonst 53111")).toEqual([
      { plz: "21244", ort: "Buchholz in der Nordheide" },
      { plz: "53111", ort: null },
    ])
  })

  it("liefert nichts ohne PLZ", () => {
    expect(parseLocationsFromText("Köln und Bonn")).toEqual([])
    expect(parseLocationsFromText(null)).toEqual([])
  })
})
