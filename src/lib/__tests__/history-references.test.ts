import { describe, expect, it } from "vitest"
import { referenceQueryAt, splitReferences } from "@/lib/comment-text"
import { historyNoteRecipients } from "@/lib/history-mentions"

// Paket 78: @Kollegen und #Aufgaben in Notizen im Verlauf.
describe("Verweise in Notizen", () => {
  const names = ["Anna Maria Schulz", "Anna Maria", "Steffen Neubert"]
  const tasks = ["Unterlagen anfordern", "Rückruf (Montag)"]

  it("erkennt Kollegen und Aufgaben, längere Treffer zuerst", () => {
    expect(splitReferences("@Anna Maria Schulz bitte #Unterlagen anfordern erledigen", names, tasks)).toEqual([
      { type: "mention", value: "Anna Maria Schulz" },
      { type: "text", value: " bitte " },
      { type: "task", value: "Unterlagen anfordern" },
      { type: "text", value: " erledigen" },
    ])
    expect(splitReferences("Siehe #Rückruf (Montag).", [], tasks)[1]).toEqual({ type: "task", value: "Rückruf (Montag)" })
    expect(splitReferences("max@web.de und #1", names, tasks)).toEqual([{ type: "text", value: "max@web.de und #1" }])
  })

  it("öffnet Vorschläge nur nach @ oder # am Wortanfang", () => {
    expect(referenceQueryAt("Hallo @Ste", 10)).toEqual({ trigger: "@", query: "Ste" })
    expect(referenceQueryAt("#Unterlagen an", 14)).toEqual({ trigger: "#", query: "Unterlagen an" })
    expect(referenceQueryAt("max@web", 7)).toBeNull()
    expect(referenceQueryAt("@Anna Maria Sch", 15)).toEqual({ trigger: "@", query: "Anna Maria Sch" })
    expect(referenceQueryAt("@Steffen Neubert hat gesagt", 27)).toBeNull()
  })

  it("benachrichtigt Erwähnte und Zuständige verknüpfter Aufgaben, nicht den Verfasser", () => {
    const team = [
      { id: "a", full_name: "Anna Maria Schulz", email: "a@x.de" },
      { id: "s", full_name: "Steffen Neubert", email: "s@x.de" },
      { id: "n", full_name: "Noah Giesecke", email: "n@x.de" },
    ]
    const taskRows = [
      { id: "t1", title: "Unterlagen anfordern", assigned_to: "s" },
      { id: "t2", title: "Rückruf", assigned_to: "n" },
    ]
    const r = historyNoteRecipients("@Anna Maria Schulz und @Noah Giesecke: #Unterlagen anfordern #Rückruf", team, taskRows, "n")
    expect(r.map((x) => [x.person.id, x.mentioned, x.tasks])).toEqual([
      ["a", true, []],
      ["s", false, ["Unterlagen anfordern"]],
    ])
  })
})
