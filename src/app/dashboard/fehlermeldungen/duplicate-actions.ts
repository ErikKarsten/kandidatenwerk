"use server"

// Sektion "Dubletten" bei den Fehlermeldungen (Paket 14, T-66) - nur Agentur-Admins.
import { revalidatePath } from "next/cache"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { createSupabaseAdminClient } from "@/lib/supabase-admin"
import { requireAgencyAdmin } from "@/lib/auth-guards"
import { runDuplicateDetection } from "@/lib/duplicates"
import { deleteDuplicateRecord, mergeCandidates, mergeClients } from "@/lib/duplicate-merge"

export interface DuplicateRecord {
  id: string
  name: string
  details: string[]
  createdAt: string
  href: string
}

export interface DuplicateCaseView {
  id: string
  kind: "kunde" | "kandidat"
  reason: string
  status: string
  createdAt: string
  records: DuplicateRecord[]
}

function admin(): SupabaseClient {
  return createSupabaseAdminClient() as unknown as SupabaseClient
}

async function guard() {
  const supabase = await createSupabaseServerClient()
  return requireAgencyAdmin(supabase)
}

export async function listDuplicateCases(status: "offen" | "alle"): Promise<DuplicateCaseView[]> {
  if ("error" in (await guard())) return []
  const db = admin()
  let q = db.from("duplicate_cases").select("id, kind, record_ids, reason, status, created_at").order("created_at", { ascending: false }).limit(300)
  if (status === "offen") q = q.eq("status", "offen")
  const { data: cases } = await q
  const ids = [...new Set((cases ?? []).flatMap((c) => c.record_ids as string[]))]
  if (ids.length === 0) return []

  // In Paketen abfragen - lange ID-Listen sprengen sonst die URL-Länge.
  const inChunks = async (table: string, columns: string, column: string, activeOnly = false) => {
    const rows: { [k: string]: unknown }[] = []
    for (let i = 0; i < ids.length; i += 80) {
      const base = db.from(table).select(columns).in(column, ids.slice(i, i + 80))
      const { data } = await (activeOnly ? base.is("removed_at", null) : base)
      rows.push(...((data ?? []) as unknown as { [k: string]: unknown }[]))
    }
    return rows
  }
  const [candidates, clients, candAssignments, clientAssignments, campaigns] = await Promise.all([
    inChunks("candidates", "id, first_name, last_name, email, phone, plz, status, source, created_at", "id"),
    inChunks("clients", "id, name, plz, ort, created_at, leadtable_customer_id, close_lead_id", "id"),
    inChunks("client_assignments", "candidate_id", "candidate_id", true),
    inChunks("client_assignments", "client_id", "client_id", true),
    inChunks("campaigns", "client_id", "client_id"),
  ])
  const assignments = [...candAssignments, ...clientAssignments]
  const count = (list: { [k: string]: unknown }[] | null, key: string, id: string) => (list ?? []).filter((r) => r[key] === id).length

  const records = new Map<string, DuplicateRecord>()
  for (const c of candidates as { [k: string]: string }[]) {
    records.set(c.id, {
      id: c.id,
      name: `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "Ohne Namen",
      details: [c.email, c.phone, c.plz ? `PLZ ${c.plz}` : null, `Status ${c.status}`, `Quelle ${c.source}`, `${count(assignments, "candidate_id", c.id)} Zuordnung(en)`].filter(Boolean) as string[],
      createdAt: c.created_at,
      href: `/dashboard/candidates/${c.id}`,
    })
  }
  for (const c of clients as { [k: string]: string }[]) {
    records.set(c.id, {
      id: c.id,
      name: c.name,
      details: [
        [c.plz, c.ort].filter(Boolean).join(" ") || null,
        `${count(campaigns, "client_id", c.id)} Kampagne(n)`,
        `${count(assignments, "client_id", c.id)} Kandidat(en)`,
        c.leadtable_customer_id ? "aus Leadtable" : null,
        c.close_lead_id ? "mit Close verknüpft" : null,
      ].filter(Boolean) as string[],
      createdAt: c.created_at,
      href: `/dashboard/clients/${c.id}`,
    })
  }

  return (cases ?? [])
    .map((c) => ({
      id: c.id as string,
      kind: c.kind as "kunde" | "kandidat",
      reason: c.reason as string,
      status: c.status as string,
      createdAt: c.created_at as string,
      records: (c.record_ids as string[]).map((id) => records.get(id)).filter((r): r is DuplicateRecord => !!r),
    }))
    // Fälle, von denen nur noch ein Datensatz existiert, sind erledigt.
    .filter((c) => c.status !== "offen" || c.records.length >= 2)
}

export async function runDuplicateCheckAction(): Promise<{ error: string } | { newCases: number; total: number }> {
  if ("error" in (await guard())) return { error: "Nur für Agentur-Admins." }
  try {
    const result = await runDuplicateDetection(admin())
    revalidatePath("/dashboard/fehlermeldungen")
    return { newCases: result.newCases.length, total: result.total }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

export async function resolveDuplicateCaseAction(
  caseId: string,
  action: "zusammenfuehren" | "ignorieren" | "loeschen",
  recordId?: string
): Promise<{ error: string } | null> {
  const g = await guard()
  if ("error" in g) return { error: g.error }
  const db = admin()
  const { data: c } = await db.from("duplicate_cases").select("id, kind, record_ids, status").eq("id", caseId).maybeSingle()
  if (!c) return { error: "Fall nicht gefunden." }
  const ids = c.record_ids as string[]
  if (action !== "ignorieren" && (!recordId || !ids.includes(recordId))) return { error: "Bitte einen Datensatz auswählen." }

  try {
    let status = "ignoriert"
    let removed: string[] = []
    if (action === "zusammenfuehren") {
      // recordId = der Datensatz, der bleibt; alle anderen werden hineingeführt.
      for (const otherId of ids.filter((id) => id !== recordId)) {
        if (c.kind === "kandidat") await mergeCandidates(db, recordId!, otherId)
        else await mergeClients(db, recordId!, otherId)
        removed.push(otherId)
      }
      status = "zusammengefuehrt"
    } else if (action === "loeschen") {
      await deleteDuplicateRecord(db, c.kind as "kunde" | "kandidat", recordId!)
      removed = [recordId!]
      status = "geloescht"
    }
    await db.from("duplicate_cases").update({ status, resolved_by: g.staff.userId, resolved_at: new Date().toISOString() }).eq("id", caseId)
    // Andere offene Fälle mit einem entfernten Datensatz sind damit ebenfalls erledigt.
    for (const id of removed) {
      await db.from("duplicate_cases").update({ status, resolved_by: g.staff.userId, resolved_at: new Date().toISOString() }).eq("status", "offen").contains("record_ids", [id])
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
  revalidatePath("/dashboard/fehlermeldungen")
  revalidatePath("/dashboard/candidates")
  revalidatePath("/dashboard/clients")
  return null
}
