"use server"

// Einstellungen -> Felder, Feld-Vorlagen und Lead-Formulare (Paket 8, 02.10.2026).
import { revalidatePath } from "next/cache"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { createSupabaseAdminClient } from "@/lib/supabase-admin"
import { getStaffContext, requireAgencyAdmin } from "@/lib/auth-guards"
import { syncMetaLeadForms, type FormQuestion } from "@/lib/lead-form-mapping"
import type { SupabaseClient } from "@supabase/supabase-js"

type Result = { error: string } | null

function revalidate() {
  revalidatePath("/dashboard/einstellungen")
}

// ── Felder: Bereich (Stammdaten / Zusatzfelder) ─────────────────────────────

export async function setCustomFieldSectionAction(id: string, section: "stammdaten" | "zusatz"): Promise<Result> {
  if (section !== "stammdaten" && section !== "zusatz") return { error: "Ungültiger Bereich." }
  const supabase = await createSupabaseServerClient()
  const guard = await requireAgencyAdmin(supabase)
  if ("error" in guard) return guard
  const { error } = await supabase.from("custom_field_definitions").update({ section }).eq("id", id)
  if (error) return { error: error.message }
  revalidate()
  return null
}

// ── Feld-Vorlagen ───────────────────────────────────────────────────────────

export interface FieldTemplate {
  id: string
  name: string
  field_keys: string[]
  is_default: boolean
}

export async function getFieldTemplates(): Promise<FieldTemplate[]> {
  const supabase = await createSupabaseServerClient()
  const ctx = await getStaffContext(supabase)
  if ("error" in ctx) return []
  const { data } = await supabase.from("field_templates").select("id, name, field_keys, is_default").order("name")
  return data ?? []
}

export async function createFieldTemplateAction(name: string, fieldKeys: string[]): Promise<Result> {
  const trimmed = name.trim()
  if (!trimmed) return { error: "Name ist ein Pflichtfeld." }
  const supabase = await createSupabaseServerClient()
  const guard = await requireAgencyAdmin(supabase)
  if ("error" in guard) return guard
  if (!guard.staff.agencyId) return { error: "Keine Agentur zugeordnet." }
  const { count } = await supabase.from("field_templates").select("id", { count: "exact", head: true })
  const { error } = await supabase.from("field_templates").insert({
    agency_id: guard.staff.agencyId,
    name: trimmed,
    field_keys: fieldKeys,
    // Die erste Vorlage wird automatisch Standard.
    is_default: (count ?? 0) === 0,
  })
  if (error) return { error: error.message }
  revalidate()
  return null
}

export async function updateFieldTemplateAction(id: string, name: string, fieldKeys: string[]): Promise<Result> {
  const trimmed = name.trim()
  if (!trimmed) return { error: "Name ist ein Pflichtfeld." }
  const supabase = await createSupabaseServerClient()
  const guard = await requireAgencyAdmin(supabase)
  if ("error" in guard) return guard
  const { error } = await supabase
    .from("field_templates")
    .update({ name: trimmed, field_keys: fieldKeys, updated_at: new Date().toISOString() })
    .eq("id", id)
  if (error) return { error: error.message }
  revalidate()
  revalidatePath("/dashboard/candidates", "layout")
  return null
}

export async function setDefaultFieldTemplateAction(id: string): Promise<Result> {
  const supabase = await createSupabaseServerClient()
  const guard = await requireAgencyAdmin(supabase)
  if ("error" in guard) return guard
  // Erst alte Standardvorlage lösen (eindeutiger Index auf is_default je Agentur).
  const { error: resetError } = await supabase.from("field_templates").update({ is_default: false }).eq("is_default", true)
  if (resetError) return { error: resetError.message }
  const { error } = await supabase.from("field_templates").update({ is_default: true }).eq("id", id)
  if (error) return { error: error.message }
  revalidate()
  return null
}

export async function deleteFieldTemplateAction(id: string): Promise<Result> {
  const supabase = await createSupabaseServerClient()
  const guard = await requireAgencyAdmin(supabase)
  if ("error" in guard) return guard
  // Kampagnen mit dieser Vorlage fallen per "on delete set null" auf die Standardvorlage zurück.
  const { error } = await supabase.from("field_templates").delete().eq("id", id)
  if (error) return { error: error.message }
  revalidate()
  return null
}

// ── Lead-Formulare ──────────────────────────────────────────────────────────

export interface LeadFormOverview {
  formId: string
  name: string | null
  pageName: string | null
  questions: FormQuestion[]
  reviewedAt: string | null
  campaigns: { id: string; title: string }[]
}

export async function getLeadForms(): Promise<LeadFormOverview[]> {
  const supabase = await createSupabaseServerClient()
  const ctx = await getStaffContext(supabase)
  if ("error" in ctx) return []
  const [{ data: forms }, { data: campaigns }] = await Promise.all([
    supabase.from("meta_lead_forms").select("form_id, name, page_name, questions, reviewed_at"),
    supabase.from("campaigns").select("id, title, meta_form_id").eq("kind", "lead").eq("status", "active").not("meta_form_id", "is", null),
  ])
  const campaignsByForm = new Map<string, { id: string; title: string }[]>()
  for (const c of campaigns ?? []) {
    campaignsByForm.set(c.meta_form_id!, [...(campaignsByForm.get(c.meta_form_id!) ?? []), { id: c.id, title: c.title }])
  }
  const known = new Set((forms ?? []).map((f) => f.form_id))
  // Formulare laufender Kampagnen, die noch nicht eingelesen wurden, trotzdem zeigen.
  const missing = [...campaignsByForm.keys()].filter((id) => !known.has(id))
  return [
    ...(forms ?? []).map((f) => ({
      formId: f.form_id,
      name: f.name,
      pageName: f.page_name,
      questions: (f.questions as unknown as FormQuestion[]) ?? [],
      reviewedAt: f.reviewed_at,
      campaigns: campaignsByForm.get(f.form_id) ?? [],
    })),
    ...missing.map((formId) => ({ formId, name: null, pageName: null, questions: [], reviewedAt: null, campaigns: campaignsByForm.get(formId) ?? [] })),
  ]
    // Formulare laufender Kampagnen zuerst, ungeprüfte vor geprüften.
    .sort((a, b) => Number(b.campaigns.length > 0) - Number(a.campaigns.length > 0) || Number(!!a.reviewedAt) - Number(!!b.reviewedAt))
}

export async function saveLeadFormMappingAction(formId: string, targets: Record<string, string>): Promise<Result> {
  const supabase = await createSupabaseServerClient()
  const guard = await requireAgencyAdmin(supabase)
  if ("error" in guard) return guard
  const { data: form, error: loadError } = await supabase.from("meta_lead_forms").select("questions").eq("form_id", formId).single()
  if (loadError || !form) return { error: loadError?.message ?? "Formular nicht gefunden." }
  const questions = ((form.questions as unknown as FormQuestion[]) ?? []).map((q) => ({ ...q, target: targets[q.key] ?? q.target }))
  const { error } = await supabase
    .from("meta_lead_forms")
    .update({ questions: questions as never, reviewed_at: new Date().toISOString() })
    .eq("form_id", formId)
  if (error) return { error: error.message }
  revalidate()
  return null
}

export async function syncLeadFormsNowAction(): Promise<{ error: string } | { forms: number; added: number; newQuestions: number; errors: string[] }> {
  const supabase = await createSupabaseServerClient()
  const guard = await requireAgencyAdmin(supabase)
  if ("error" in guard) return guard
  const agencyId = guard.staff.agencyId
  if (!agencyId) return { error: "Keine Agentur zugeordnet." }

  const admin = createSupabaseAdminClient() as unknown as SupabaseClient
  const [{ data: campaigns }, { data: fields }] = await Promise.all([
    admin.from("campaigns").select("meta_form_id").eq("kind", "lead").eq("status", "active").not("meta_form_id", "is", null),
    admin.from("custom_field_definitions").select("key").eq("agency_id", agencyId).eq("active", true),
  ])
  try {
    const result = await syncMetaLeadForms(
      admin,
      agencyId,
      (campaigns ?? []).map((c) => c.meta_form_id as string),
      new Set((fields ?? []).map((f) => f.key as string))
    )
    revalidate()
    return result
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}
