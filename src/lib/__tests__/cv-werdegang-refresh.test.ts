import { describe, expect, it } from "vitest"
import { mentionsStations } from "@/lib/cron/cv-werdegang-refresh"

// Paket 83: Werdegang im Hintergrund, wenn die Beschreibung Stationen enthält.
describe("Stationen in der Beschreibung", () => {
  it("erkennt Zeiträume", () => {
    expect(mentionsStations("2016 - 2021 Fußballer\n2021 - 2024 E Commerce Manager")).toBe(true)
    expect(mentionsStations("STEUERFACHANGESTELLTER\n05/2022 – aktuell")).toBe(true)
    expect(mentionsStations("11/2021 – 03/2022")).toBe(true)
    expect(mentionsStations("Seit 2019 in einer Kanzlei")).toBe(true)
  })

  it("übergeht Notizen ohne Stationen", () => {
    expect(mentionsStations("21.10.26 (13:58) - erreicht! Rückruf ab 17:00")).toBe(false)
    expect(mentionsStations("Gehalt 52.000, 30 Std.")).toBe(false)
    expect(mentionsStations(null)).toBe(false)
  })
})
