"use server"

import { revalidatePath } from "next/cache"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { requireAgencyAdmin } from "@/lib/auth-guards"
import { berufsbildKey } from "@/lib/berufsbild"

// Berufsbilder pflegen (Paket 45) - nur Admins. Schlüssel bleiben fest, weil sie an
// Kandidaten, Kampagnen, Stellen und Textbausteinen stehen; statt Löschen gibt es
// Deaktivieren (verschwindet aus den Auswahlfeldern, bestehende Daten bleiben lesbar).
type Result = { error: string } | null

async function admin() {
  const supabase = await createSupabaseServerClient()
  const guard = await requireAgencyAdmin(supabase)
  return "error" in guard ? guard : { supabase }
}

function done(): Result {
  // Die Liste kommt über das Dashboard-Layout in alle Seiten.
  revalidatePath("/dashboard", "layout")
  return null
}

export async function createBerufsbildAction(label: string): Promise<Result> {
  const ctx = await admin()
  if ("error" in ctx) return ctx
  const clean = label.replace(/\s+/g, " ").trim()
  const key = berufsbildKey(clean)
  if (!clean || !key) return { error: "Bitte eine Bezeichnung eingeben." }
  const { data: rows } = await ctx.supabase.from("berufsbilder").select("key, label, sort_order")
  if (rows?.some((r) => r.key === key || r.label.toLowerCase() === clean.toLowerCase())) return { error: "Dieses Berufsbild gibt es schon." }
  // Neue Einträge vor "Sonstige", das immer am Ende steht.
  const last = Math.max(0, ...(rows ?? []).filter((r) => r.key !== "sonstige").map((r) => r.sort_order))
  const { error } = await ctx.supabase.from("berufsbilder").insert({ key, label: clean, sort_order: last + 10 })
  if (error) return { error: error.message }
  return done()
}

export async function updateBerufsbildAction(key: string, values: { label?: string; active?: boolean }): Promise<Result> {
  const ctx = await admin()
  if ("error" in ctx) return ctx
  const update: { label?: string; active?: boolean } = {}
  if (values.label !== undefined) {
    const clean = values.label.replace(/\s+/g, " ").trim()
    if (!clean) return { error: "Die Bezeichnung darf nicht leer sein." }
    update.label = clean
  }
  if (values.active !== undefined) {
    if (key === "sonstige" && !values.active) return { error: "„Sonstige“ wird als Rückfall gebraucht und bleibt aktiv." }
    update.active = values.active
  }
  const { error } = await ctx.supabase.from("berufsbilder").update(update).eq("key", key)
  if (error) return { error: error.message }
  return done()
}

// Reihenfolge: mit dem Nachbarn tauschen.
export async function moveBerufsbildAction(key: string, direction: "up" | "down"): Promise<Result> {
  const ctx = await admin()
  if ("error" in ctx) return ctx
  const { data: rows, error } = await ctx.supabase.from("berufsbilder").select("key, sort_order").order("sort_order").order("label")
  if (error) return { error: error.message }
  const list = rows ?? []
  const i = list.findIndex((r) => r.key === key)
  const j = direction === "up" ? i - 1 : i + 1
  if (i < 0 || j < 0 || j >= list.length) return null
  // Fortlaufend neu nummerieren, damit gleiche Werte nicht hängen bleiben.
  const ordered = [...list]
  ;[ordered[i], ordered[j]] = [ordered[j], ordered[i]]
  for (const [index, row] of ordered.entries()) {
    const sort = (index + 1) * 10
    if (row.sort_order !== sort) {
      const { error: updateError } = await ctx.supabase.from("berufsbilder").update({ sort_order: sort }).eq("key", row.key)
      if (updateError) return { error: updateError.message }
    }
  }
  return done()
}
