"use server"

// Einstellungen > Felder: Kanzleiprofil, Stellenprofil und Textbausteine (Paket 18, T-80).
// Nur Team; RLS beschränkt zusätzlich auf die eigene Agentur.
import { revalidatePath } from "next/cache"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getStaffContext } from "@/lib/auth-guards"
import { customFieldKey, type FieldScope } from "@/lib/profile-fields"

type Result = { error: string } | null

async function staff() {
  const supabase = await createSupabaseServerClient()
  const ctx = await getStaffContext(supabase)
  if ("error" in ctx) return ctx
  if (!ctx.staff.agencyId) return { error: "Eigene Agentur konnte nicht ermittelt werden." }
  return { supabase, agencyId: ctx.staff.agencyId }
}

function done(): null {
  revalidatePath("/dashboard/einstellungen")
  revalidatePath("/dashboard/clients", "layout")
  return null
}

export interface FieldSettingInput {
  label: string
  hint: string
  required: boolean
  active: boolean
  multiline: boolean
  field_group: string | null
}

// Eingebautes oder eigenes Feld speichern (Überschreibung je Agentur).
export async function saveProfileFieldAction(scope: FieldScope, key: string, isCustom: boolean, input: FieldSettingInput): Promise<Result> {
  const label = input.label.trim()
  if (!label) return { error: "Bezeichnung ist ein Pflichtfeld." }
  const ctx = await staff()
  if ("error" in ctx) return ctx
  const { error } = await ctx.supabase.from("profile_field_settings").upsert(
    {
      agency_id: ctx.agencyId,
      scope,
      key,
      label,
      hint: input.hint.trim() || null,
      required: input.required,
      active: input.active,
      multiline: input.multiline,
      is_custom: isCustom,
      field_group: input.field_group,
    },
    { onConflict: "agency_id,scope,key" }
  )
  if (error) return { error: error.message }
  return done()
}

// Eingebautes Feld auf den Standard zurücksetzen.
export async function resetProfileFieldAction(scope: FieldScope, key: string): Promise<Result> {
  const ctx = await staff()
  if ("error" in ctx) return ctx
  const { error } = await ctx.supabase.from("profile_field_settings").delete().eq("scope", scope).eq("key", key).eq("is_custom", false)
  if (error) return { error: error.message }
  return done()
}

export async function addCustomProfileFieldAction(scope: FieldScope, input: FieldSettingInput): Promise<Result> {
  const label = input.label.trim()
  if (!label) return { error: "Bezeichnung ist ein Pflichtfeld." }
  const ctx = await staff()
  if ("error" in ctx) return ctx
  const { data: existing } = await ctx.supabase.from("profile_field_settings").select("key, sort_order").eq("scope", scope)
  let key = customFieldKey(label)
  const taken = new Set((existing ?? []).map((e) => e.key))
  for (let i = 2; taken.has(key); i++) key = `${customFieldKey(label)}_${i}`
  const { error } = await ctx.supabase.from("profile_field_settings").insert({
    agency_id: ctx.agencyId,
    scope,
    key,
    label,
    hint: input.hint.trim() || null,
    required: input.required,
    active: true,
    multiline: input.multiline,
    is_custom: true,
    field_group: input.field_group,
    sort_order: Math.max(0, ...(existing ?? []).map((e) => e.sort_order)) + 1,
  })
  if (error) return { error: error.message }
  return done()
}

// Eigenes Feld löschen - bereits erfasste Werte bleiben in `extra` erhalten, werden aber
// nicht mehr angezeigt.
export async function deleteCustomProfileFieldAction(scope: FieldScope, key: string): Promise<Result> {
  const ctx = await staff()
  if ("error" in ctx) return ctx
  const { error } = await ctx.supabase.from("profile_field_settings").delete().eq("scope", scope).eq("key", key).eq("is_custom", true)
  if (error) return { error: error.message }
  return done()
}

// ── Textbausteine ─────────────────────────────────────────────────────────────

export async function saveSnippetAction(
  id: string | null,
  input: { berufsbild: string; kind: "aufgaben" | "anforderungen"; text: string }
): Promise<Result> {
  const text = input.text.trim()
  if (!text) return { error: "Bitte einen Text eingeben." }
  const ctx = await staff()
  if ("error" in ctx) return ctx
  if (id) {
    const { error } = await ctx.supabase.from("position_snippets").update({ text }).eq("id", id)
    if (error) return { error: error.message }
  } else {
    const { data: last } = await ctx.supabase
      .from("position_snippets")
      .select("sort_order")
      .eq("berufsbild", input.berufsbild)
      .eq("kind", input.kind)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle()
    const { error } = await ctx.supabase
      .from("position_snippets")
      .insert({ agency_id: ctx.agencyId, berufsbild: input.berufsbild, kind: input.kind, text, sort_order: (last?.sort_order ?? -1) + 1 })
    if (error) return { error: error.message }
  }
  return done()
}

export async function deleteSnippetAction(id: string): Promise<Result> {
  const ctx = await staff()
  if ("error" in ctx) return ctx
  const { error } = await ctx.supabase.from("position_snippets").delete().eq("id", id)
  if (error) return { error: error.message }
  return done()
}
