import { describe, expect, it } from "vitest"
import { attachmentsToSave, saveInboundAttachments } from "@/lib/inbound-replies"

// Paket 77: Anhänge aus Antworten von Kandidaten landen unter "Dateien".
describe("Anhänge aus E-Mail-Antworten", () => {
  const cv = { Name: "Lebenslauf.pdf", ContentType: "application/pdf", ContentLength: 120_000, DownloadToken: "tok-cv" }
  const logo = { Name: "logo.png", ContentType: "image/png", ContentLength: 4_000, ContentID: "logo@sig", DownloadToken: "tok-logo" }
  const photo = { Name: "Zeugnis.jpg", ContentType: "image/jpeg", ContentLength: 300_000, DownloadToken: "tok-foto" }

  it("übernimmt Dateien, aber keine eingebetteten Bilder aus der Signatur", () => {
    expect(attachmentsToSave([cv, logo, photo]).map((a) => a.Name)).toEqual(["Lebenslauf.pdf", "Zeugnis.jpg"])
    expect(attachmentsToSave([{ ...cv, ContentLength: 40 * 1024 * 1024 }])).toEqual([])
  })

  it("lädt bei Brevo herunter und legt die Datei beim Kandidaten ab", async () => {
    const uploads: string[] = []
    const rows: Record<string, unknown>[] = []
    const db = {
      storage: { from: () => ({ upload: async (path: string) => (uploads.push(path), { error: null }) }) },
      from: () => ({ insert: async (row: Record<string, unknown>) => (rows.push(row), { error: null }) }),
    }
    const requested: string[] = []
    const fetchImpl = (async (url: string) => {
      requested.push(url)
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 })
    }) as unknown as typeof fetch
    const result = await saveInboundAttachments(db as never, "cand-1", [cv, logo], fetchImpl)
    expect(result).toEqual({ saved: ["Lebenslauf.pdf"], failed: [] })
    expect(requested).toEqual(["https://api.brevo.com/v3/inbound/attachments/tok-cv"])
    expect(uploads[0]).toMatch(/^cand-1\/\d+-Lebenslauf\.pdf$/)
    expect(rows[0]).toMatchObject({ candidate_id: "cand-1", file_name: "Lebenslauf.pdf", file_size: 3, mime_type: "application/pdf" })
  })

  it("meldet fehlgeschlagene Downloads, statt die Antwort zu verlieren", async () => {
    const db = { storage: { from: () => ({ upload: async () => ({ error: null }) }) }, from: () => ({ insert: async () => ({ error: null }) }) }
    const fetchImpl = (async () => new Response("nope", { status: 404 })) as unknown as typeof fetch
    const errors = console.error
    console.error = () => {}
    const result = await saveInboundAttachments(db as never, "cand-1", [cv], fetchImpl)
    console.error = errors
    expect(result).toEqual({ saved: [], failed: ["Lebenslauf.pdf"] })
  })
})

describe("Anhänge an der Nachricht (Paket 78)", () => {
  const message = {
    direction: "eingehend",
    created_at: "2026-10-22T08:25:17.900Z",
    body: "Anbei mein Lebenslauf.\n\nAnhänge (im Reiter „Dateien“): Lebenslauf.pdf, Zeugnis, Teil 1.pdf",
  }
  const files = [
    { name: "Lebenslauf.pdf", created_at: "2026-10-22T08:25:18.385Z" },
    { name: "Zeugnis, Teil 1.pdf", created_at: "2026-10-22T08:25:19.100Z" },
    { name: "Lebenslauf.pdf", created_at: "2026-09-01T10:00:00.000Z" },
    { name: "Foto.jpg", created_at: "2026-10-22T08:25:18.500Z" },
  ]

  it("findet die Dateien, die mit der Antwort gekommen sind", async () => {
    const { filesOfMessage } = await import("@/lib/inbound-replies")
    expect(filesOfMessage(message, files)).toEqual([files[0], files[1]])
    expect(filesOfMessage({ ...message, direction: "ausgehend" }, files)).toEqual([])
    expect(filesOfMessage({ ...message, body: "Ohne Anhang" }, files)).toEqual([])
  })

  it("nimmt den Hinweis aus dem Text, wenn die Dateien darunter stehen", async () => {
    const { bodyWithoutSavedNote } = await import("@/lib/inbound-replies")
    expect(bodyWithoutSavedNote(message.body)).toBe("Anbei mein Lebenslauf.")
    expect(bodyWithoutSavedNote("Text\n\nNicht übernommen: gross.zip")).toBe("Text\n\nNicht übernommen: gross.zip")
  })
})
