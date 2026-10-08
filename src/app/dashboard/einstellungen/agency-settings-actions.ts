"use server"

// Agentur-Einstellungen (Paket 23): Logo für alle Mails (T-94) und zentrale
// Eingangsbestätigung an Kandidaten (T-93). Ändern nur Agentur-Admins.
import { revalidatePath } from "next/cache"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { createSupabaseAdminClient } from "@/lib/supabase-admin"
import { getStaffContext, requireAgencyAdmin } from "@/lib/auth-guards"

export interface AgencySettings {
  logoUrl: string | null
  confirmationActive: boolean
  confirmationTemplateId: string | null
}

type Result = { error: string } | null

export async function getAgencySettings(): Promise<AgencySettings> {
  const supabase = await createSupabaseServerClient()
  const ctx = await getStaffContext(supabase)
  const empty = { logoUrl: null, confirmationActive: false, confirmationTemplateId: null }
  if ("error" in ctx || !ctx.staff.agencyId) return empty
  const { data } = await supabase.from("agency_settings").select("logo_url, confirmation_active, confirmation_template_id").eq("agency_id", ctx.staff.agencyId).maybeSingle()
  return data
    ? { logoUrl: data.logo_url, confirmationActive: data.confirmation_active, confirmationTemplateId: data.confirmation_template_id }
    : empty
}

async function admin() {
  const supabase = await createSupabaseServerClient()
  const ctx = await requireAgencyAdmin(supabase)
  if ("error" in ctx) return ctx
  if (!ctx.staff.agencyId) return { error: "Eigene Agentur konnte nicht ermittelt werden." }
  return { db: createSupabaseAdminClient(), agencyId: ctx.staff.agencyId }
}

const LOGO_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }

export async function uploadAgencyLogoAction(formData: FormData): Promise<{ error: string } | { url: string }> {
  const file = formData.get("logo") as File | null
  if (!file || file.size === 0) return { error: "Keine Datei ausgewählt." }
  // Kein SVG: viele Mailprogramme zeigen SVG-Bilder nicht an.
  if (!LOGO_TYPES[file.type]) return { error: "Logo bitte als PNG, JPG oder WebP hochladen." }
  if (file.size > 2 * 1024 * 1024) return { error: "Das Logo darf höchstens 2 MB groß sein." }
  const ctx = await admin()
  if ("error" in ctx) return ctx
  const path = `agentur/${ctx.agencyId}/logo.${LOGO_TYPES[file.type]}`
  const { error: uploadError } = await ctx.db.storage
    .from("client-logos")
    .upload(path, Buffer.from(await file.arrayBuffer()), { upsert: true, contentType: file.type })
  if (uploadError) return { error: uploadError.message }
  // Abmessungen in der URL mitführen: Mails setzen damit feste width/height (Outlook
  // ignoriert max-height, Paket 38). Das Bild selbst verkleinert der Browser vorher.
  const w = Number(formData.get("width"))
  const h = Number(formData.get("height"))
  const dims = Number.isInteger(w) && Number.isInteger(h) && w > 0 && h > 0 ? `&w=${w}&h=${h}` : ""
  const url = `${ctx.db.storage.from("client-logos").getPublicUrl(path).data.publicUrl}?v=${Date.now()}${dims}`
  const { error } = await ctx.db.from("agency_settings").upsert({ agency_id: ctx.agencyId, logo_url: url, updated_at: new Date().toISOString() })
  if (error) return { error: error.message }
  revalidatePath("/dashboard/einstellungen")
  return { url }
}

export async function removeAgencyLogoAction(): Promise<Result> {
  const ctx = await admin()
  if ("error" in ctx) return ctx
  const { error } = await ctx.db.from("agency_settings").upsert({ agency_id: ctx.agencyId, logo_url: null, updated_at: new Date().toISOString() })
  if (error) return { error: error.message }
  revalidatePath("/dashboard/einstellungen")
  return null
}

export async function saveConfirmationSettingsAction(input: { active: boolean; templateId: string | null }): Promise<Result> {
  if (input.active && !input.templateId) return { error: "Bitte eine Vorlage auswählen." }
  const ctx = await admin()
  if ("error" in ctx) return ctx
  const { data: current } = await ctx.db.from("agency_settings").select("confirmation_active").eq("agency_id", ctx.agencyId).maybeSingle()
  const { error } = await ctx.db.from("agency_settings").upsert({
    agency_id: ctx.agencyId,
    confirmation_active: input.active,
    confirmation_template_id: input.templateId,
    // Beim Einschalten zählt ab jetzt - keine Mails an Bestandskandidaten.
    ...(input.active && !current?.confirmation_active ? { confirmation_active_since: new Date().toISOString() } : {}),
    updated_at: new Date().toISOString(),
  })
  if (error) return { error: error.message }
  revalidatePath("/dashboard/einstellungen")
  return null
}
