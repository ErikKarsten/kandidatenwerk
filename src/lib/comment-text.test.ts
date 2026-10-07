import { describe, expect, it } from "vitest"
import { parseCommentLines, splitLinks, taskTitleFromLine } from "./comment-text"

describe("Kommentartexte", () => {
  it("erkennt Links ohne Satzzeichen am Ende", () => {
    expect(splitLinks("In Close ansehen: https://app.close.com/lead/lead_abc/.")).toEqual([
      { type: "text", value: "In Close ansehen: " },
      { type: "link", value: "https://app.close.com/lead/lead_abc/" },
      { type: "text", value: "." },
    ])
  })

  it("markiert nur Punkte unter nächsten Schritten und offenen Fragen", () => {
    const lines = parseCommentLines(
      "Kurzfazit: gut\n\nBesprochen:\n- Stelle A\n\nVereinbart / nächste Schritte:\n- Angebot verschicken (Noah, bis Freitag)\n\nOffene Fragen:\n- Zugriffsproblem klären",
      true
    )
    expect(lines.filter((l) => l.actionable).map((l) => l.text)).toEqual(["- Angebot verschicken (Noah, bis Freitag)", "- Zugriffsproblem klären"])
    expect(parseCommentLines("Offene Fragen:\n- x", false).some((l) => l.actionable)).toBe(false)
  })

  it("kürzt Aufgabentitel", () => {
    expect(taskTitleFromLine("- Angebot verschicken")).toBe("Angebot verschicken")
    expect(taskTitleFromLine("- " + "a".repeat(200))).toHaveLength(118)
  })
})
