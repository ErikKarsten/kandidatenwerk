import { describe, expect, it, vi } from "vitest"
import { redirect } from "next/navigation"
import { SAVE_FAILED_MESSAGE, safeAction } from "./safe-action"

describe("safeAction (Paket 99)", () => {
  it("gibt das Ergebnis der Action unverändert zurück", async () => {
    expect(await safeAction(async () => null)).toBeNull()
    expect(await safeAction(async () => ({ error: "Nicht berechtigt." }))).toEqual({ error: "Nicht berechtigt." })
  })

  it("macht aus einem abgebrochenen Speichern eine Fehlermeldung statt eines Absturzes", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    expect(await safeAction(async () => { throw new TypeError("Failed to fetch") })).toEqual({ error: SAVE_FAILED_MESSAGE })
    expect(await safeAction(async () => { throw new Error("x") }, "Eigene Meldung")).toEqual({ error: "Eigene Meldung" })
    spy.mockRestore()
  })

  it("lässt Weiterleitungen von Next durch", async () => {
    await expect(safeAction(async () => redirect("/dashboard"))).rejects.toThrow()
  })
})
