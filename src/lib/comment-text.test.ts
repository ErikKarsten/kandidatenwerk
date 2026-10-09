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

  it("gliedert Gesprächszusammenfassungen", () => {
    const lines = parseCommentLines(
      "Willkommensmeeting · 07.10.2026\n\nKurzfazit: Alles gut.\n\nBesprochen:\n- Stelle A\n\nVereinbart / nächste Schritte:\n- Angebot verschicken (Noah, bis Freitag)\n\nOffene Fragen:\n- Zugriffsproblem klären\n\nIn Close ansehen: https://app.close.com/lead/x/",
      true
    )
    expect(lines[0]).toMatchObject({ kind: "title", text: "Willkommensmeeting · 07.10.2026" })
    expect(lines.find((l) => l.text === "Kurzfazit")).toMatchObject({ kind: "heading", rest: "Alles gut." })
    expect(lines.filter((l) => l.kind === "heading").map((l) => l.text)).toEqual(["Kurzfazit", "Besprochen", "Vereinbart / nächste Schritte", "Offene Fragen"])
    expect(lines.filter((l) => l.actionable).map((l) => l.text)).toEqual(["Angebot verschicken (Noah, bis Freitag)", "Zugriffsproblem klären"])
    expect(lines.at(-1)).toMatchObject({ kind: "link", text: "https://app.close.com/lead/x/" })
  })

  it("lässt normale Notizen ungegliedert", () => {
    const lines = parseCommentLines("Hinweis: Rückruf morgen\n- Punkt", false)
    expect(lines.map((l) => l.kind)).toEqual(["text", "bullet"])
    expect(lines.some((l) => l.actionable)).toBe(false)
  })

  it("kürzt Aufgabentitel", () => {
    expect(taskTitleFromLine("- Angebot verschicken")).toBe("Angebot verschicken")
    expect(taskTitleFromLine("- " + "a".repeat(200))).toHaveLength(118)
  })
})

describe("splitMentions", () => {
  it("hebt erwähnte Team-Mitglieder hervor, längere Namen zuerst", async () => {
    const { splitMentions } = await import("@/lib/comment-text")
    expect(splitMentions("Hallo @Elea Günther und @Noah Giesecke!", ["Noah Giesecke", "Elea Günther"])).toEqual([
      { type: "text", value: "Hallo " },
      { type: "mention", value: "Elea Günther" },
      { type: "text", value: " und " },
      { type: "mention", value: "Noah Giesecke" },
      { type: "text", value: "!" },
    ])
    expect(splitMentions("ohne", [])).toEqual([{ type: "text", value: "ohne" }])
  })
})
