import { describe, expect, it } from "vitest"
import { handleAnswer, handleHangup, handleNewCall, type PushEvent } from "@/lib/sipgate-calls"

// Paket 92: ein kompletter Anruf von newCall bis hangup gegen eine kleine In-Memory-Datenbank.
type Row = Record<string, unknown>
function fakeDb(tables: Record<string, Row[]>) {
  let nextId = 1
  return {
    tables,
    from(table: string) {
      const rows = (tables[table] ??= [])
      const filters: ((r: Row) => boolean)[] = []
      let patch: Row | null = null
      const q = {
        select: () => q,
        eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), q),
        is: (k: string, v: unknown) => (filters.push((r) => (r[k] ?? null) === v), q),
        in: (k: string, v: unknown[]) => (filters.push((r) => v.includes(r[k])), q),
        gte: (k: string, v: string) => (filters.push((r) => String(r[k]) >= v), q),
        order: () => q,
        limit: () => q,
        maybeSingle: async () => ({ data: rows.find((r) => filters.every((f) => f(r))) ?? null, error: null }),
        insert: async (row: Row) => {
          rows.push({ id: `id${nextId++}`, ...row })
          return { error: null }
        },
        update: (p: Row) => ((patch = p), q),
        then: (resolve: (v: unknown) => void) => {
          if (patch) for (const r of rows.filter((r) => filters.every((f) => f(r)))) Object.assign(r, patch)
          resolve({ error: null })
        },
      }
      return q
    },
  }
}

const ev = (event: string, extra: Partial<PushEvent> = {}): PushEvent => ({
  event,
  callId: "c1",
  direction: "out",
  from: "4930123456",
  to: "4915111030580",
  cause: null,
  sipgateUserIds: ["w2"],
  ...extra,
})

describe("Anruf über Kandidatenwerk", () => {
  it("ordnet den gestarteten Anruf zu und schreibt ihn nach dem Auflegen in den Verlauf", async () => {
    const t0 = new Date("2026-10-27T10:00:00Z")
    const db = fakeDb({
      candidate_calls: [{ id: "p1", candidate_id: "k1", user_id: "u1", direction: "out", number: "4915111030580", sipgate_call_id: null, status: "gestartet", started_at: "2026-10-27T09:59:30.000Z" }],
      candidates: [],
      profiles: [{ id: "u1", full_name: "Christina Hohler", sipgate_user_id: "w2" }],
      candidate_history: [],
    })
    expect(await handleNewCall(db as never, ev("newCall"), t0)).toBe(true)
    await handleAnswer(db as never, ev("answer"), new Date("2026-10-27T10:00:10Z"))
    await handleHangup(db as never, ev("hangup", { cause: "normalClearing" }), new Date("2026-10-27T10:06:22Z"))
    expect(db.tables.candidate_calls[0]).toMatchObject({ sipgate_call_id: "c1", status: "beendet", duration_seconds: 372 })
    expect(db.tables.candidate_history).toEqual([
      { id: "id1", candidate_id: "k1", type: "call", content: "Ausgehender Anruf · Christina Hohler · 6:12 Min · erreicht", created_by: "u1" },
    ])
  })

  it("erkennt Kandidaten auch an der Nummer, wenn direkt vom Telefon angerufen wurde", async () => {
    const db = fakeDb({
      candidate_calls: [],
      candidates: [{ id: "k2", phone_normalized: "4915111030580", is_demo: false }],
      profiles: [{ id: "u3", full_name: "Josef Beck", sipgate_user_id: "w2" }],
      candidate_history: [],
    })
    expect(await handleNewCall(db as never, ev("newCall", { callId: "c2" }))).toBe(true)
    await handleHangup(db as never, ev("hangup", { callId: "c2", cause: "noAnswer" }))
    expect(db.tables.candidate_history[0]).toMatchObject({ candidate_id: "k2", content: "Ausgehender Anruf · Josef Beck · nicht erreicht (keine Antwort)" })
  })

  it("ignoriert Anrufe ohne Kandidaten", async () => {
    const db = fakeDb({ candidate_calls: [], candidates: [], profiles: [], candidate_history: [] })
    expect(await handleNewCall(db as never, ev("newCall", { callId: "c3", to: "4989999999" }))).toBe(false)
    expect(db.tables.candidate_calls).toHaveLength(0)
  })
})
