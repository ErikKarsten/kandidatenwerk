"use server"

// Automatisierungs-Vorlagen und Vorlagensets in den Einstellungen (Paket 15, T-74).
// Nur Team; RLS beschränkt zusätzlich auf die eigene Agentur.
import { revalidatePath } from "next/cache"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getStaffContext } from "@/lib/auth-guards"
import { AUTOMATION_RECIPIENT_OPTIONS, AUTOMATION_TRIGGER_OPTIONS } from "@/lib/automation-templates"
import { CANDIDATE_STATUS_OPTIONS } from "@/lib/candidate-status"

export interface AutomationTemplate {
  id: string
  name: string
  trigger: string
  trigger_status: string | null
  delay_seconds: number
  recipient: string
  subject: string
  body_html: string
}

export interface AutomationTemplateSet {
  id: string
  name: string
  is_default: boolean
  templateIds: string[]
}

export type AutomationTemplateInput = Omit<AutomationTemplate, "id">

type Result = { error: string } | null

async function staff() {
  const supabase = await createSupabaseServerClient()
  const ctx = await getStaffContext(supabase)
  if ("error" in ctx) return ctx
  if (!ctx.staff.agencyId) return { error: "Eigene Agentur konnte nicht ermittelt werden." }
  return { supabase, agencyId: ctx.staff.agencyId }
}

function validate(t: AutomationTemplateInput): string | null {
  if (!t.name.trim()) return "Name ist ein Pflichtfeld."
  if (!AUTOMATION_TRIGGER_OPTIONS.some((o) => o.value === t.trigger)) return "Ungültiger Auslöser."
  if (t.trigger === "status_change" && !CANDIDATE_STATUS_OPTIONS.some((o) => o.value === t.trigger_status)) return "Bitte den Status wählen."
  if (!AUTOMATION_RECIPIENT_OPTIONS.some((o) => o.value === t.recipient)) return "Ungültiger Empfänger."
  if (t.trigger === "manual" && t.recipient !== "candidate") return "Manuelle Vorlagen gehen immer an den Kandidaten."
  if (t.trigger === "client_assigned" && t.recipient === "candidate") return "Diese Vorlage geht an die Kanzlei - bitte Empfänger Kunde wählen."
  if (!Number.isFinite(t.delay_seconds) || t.delay_seconds < 0) return "Ungültige Verzögerung."
  if (!t.subject.trim()) return "Betreff ist ein Pflichtfeld."
  if (!t.body_html.trim()) return "Text ist ein Pflichtfeld."
  return null
}

function clean(t: AutomationTemplateInput) {
  return {
    name: t.name.trim(),
    trigger: t.trigger,
    trigger_status: t.trigger === "status_change" ? t.trigger_status : null,
    delay_seconds: Math.round(t.delay_seconds),
    recipient: t.recipient,
    subject: t.subject.trim(),
    body_html: t.body_html,
  }
}

export async function getAutomationTemplates(): Promise<{ templates: AutomationTemplate[]; sets: AutomationTemplateSet[] }> {
  const ctx = await staff()
  if ("error" in ctx) return { templates: [], sets: [] }
  const [{ data: templates }, { data: sets }, { data: items }] = await Promise.all([
    ctx.supabase.from("automation_templates").select("id, name, trigger, trigger_status, delay_seconds, recipient, subject, body_html").order("name"),
    ctx.supabase.from("automation_template_sets").select("id, name, is_default").order("name"),
    ctx.supabase.from("automation_template_set_items").select("set_id, template_id"),
  ])
  return {
    templates: templates ?? [],
    sets: (sets ?? []).map((s) => ({ ...s, templateIds: (items ?? []).filter((i) => i.set_id === s.id).map((i) => i.template_id) })),
  }
}

export async function saveAutomationTemplateAction(id: string | null, input: AutomationTemplateInput): Promise<Result> {
  const invalid = validate(input)
  if (invalid) return { error: invalid }
  const ctx = await staff()
  if ("error" in ctx) return ctx
  const { error } = id
    ? await ctx.supabase.from("automation_templates").update({ ...clean(input), updated_at: new Date().toISOString() }).eq("id", id)
    : await ctx.supabase.from("automation_templates").insert({ ...clean(input), agency_id: ctx.agencyId })
  if (error) return { error: error.message }
  revalidatePath("/dashboard/einstellungen")
  return null
}

export async function deleteAutomationTemplateAction(id: string): Promise<Result> {
  const ctx = await staff()
  if ("error" in ctx) return ctx
  // Bereits übernommene Automatisierungen in Kampagnen bleiben (template_id -> null).
  const { error } = await ctx.supabase.from("automation_templates").delete().eq("id", id)
  if (error) return { error: error.message }
  revalidatePath("/dashboard/einstellungen")
  return null
}

export async function saveAutomationTemplateSetAction(
  id: string | null,
  input: { name: string; isDefault: boolean; templateIds: string[] }
): Promise<Result> {
  const name = input.name.trim()
  if (!name) return { error: "Name ist ein Pflichtfeld." }
  if (input.templateIds.length === 0) return { error: "Bitte mindestens eine Vorlage auswählen." }
  const ctx = await staff()
  if ("error" in ctx) return ctx

  // Nur ein Standard-Set je Agentur (eindeutiger Index) - vorher die Markierung lösen.
  if (input.isDefault) {
    const { error } = await ctx.supabase.from("automation_template_sets").update({ is_default: false }).eq("is_default", true)
    if (error) return { error: error.message }
  }
  let setId = id
  if (id) {
    const { error } = await ctx.supabase.from("automation_template_sets").update({ name, is_default: input.isDefault }).eq("id", id)
    if (error) return { error: error.message }
    const { error: clearError } = await ctx.supabase.from("automation_template_set_items").delete().eq("set_id", id)
    if (clearError) return { error: clearError.message }
  } else {
    const { data, error } = await ctx.supabase
      .from("automation_template_sets")
      .insert({ name, is_default: input.isDefault, agency_id: ctx.agencyId })
      .select("id")
      .single()
    if (error) return { error: error.message }
    setId = data.id
  }
  const { error: itemsError } = await ctx.supabase
    .from("automation_template_set_items")
    .insert(input.templateIds.map((templateId) => ({ set_id: setId!, template_id: templateId })))
  if (itemsError) return { error: itemsError.message }
  revalidatePath("/dashboard/einstellungen")
  return null
}

export async function deleteAutomationTemplateSetAction(id: string): Promise<Result> {
  const ctx = await staff()
  if ("error" in ctx) return ctx
  const { error } = await ctx.supabase.from("automation_template_sets").delete().eq("id", id)
  if (error) return { error: error.message }
  revalidatePath("/dashboard/einstellungen")
  return null
}
