import { describe, expect, it } from "vitest"
import { processMetaLead } from "@/lib/meta-leads-sync-shared"

// Paket 81: Meta-Testleads werden nie als Kandidat angelegt (auch nicht im 30-Minuten-Abgleich).
describe("Meta-Testleads", () => {
  it("legt für einen Testlead keinen Kandidaten an", async () => {
    const inserts: string[] = []
    const db = {
      from(table: string) {
        const q: Record<string, unknown> = {}
        for (const m of ["select", "eq"]) q[m] = () => q
        q.maybeSingle = async () => ({ data: null, error: null })
        q.insert = () => {
          inserts.push(table)
          return q
        }
        return q
      },
    } as never
    const lead = {
      id: "1",
      created_time: "2026-10-22T13:05:00+0000",
      field_data: [
        { name: "vollständiger_name", values: ["<test lead: dummy data for vollständiger_name>"] },
        { name: "e-mail-adresse", values: ["test@meta.com"] },
      ],
    }
    await expect(processMetaLead(db, { id: "c", title: "Stfa", client_id: "k", kind: "kanzlei" }, lead)).resolves.toEqual({ status: "test_lead" })
    expect(inserts).toEqual([])
  })
})
