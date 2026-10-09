"use server"

// Projekt-Reiter beim Kunden (Paket 9): Phase/Vertrag, Kanzleiprofil, gesuchte Stellen,
// Kommentare. Nur Team (RLS + requireStaffUser).
import { revalidatePath } from "next/cache"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getStaffContext } from "@/lib/auth-guards"
import { geocodePlz } from "@/lib/geocode-plz"
import { parsePlzList } from "@/lib/campaign-locations"
import { matchCampaignToCandidates } from "@/lib/matching"
import { getOrCreateLocationForPlz } from "@/lib/location-clustering"
import { sendEmail } from "@/lib/brevo-mail"
import { closeLeadUrl } from "@/lib/close-webhook"
import { notifyTaskAssigned } from "@/lib/task-notify"
import { ensureClientLocation } from "@/lib/client-locations"
import {
  CAMPAIGN_CHECK_TASK,
  PROFILE_FIELDS,
  PROJECT_PHASES,
  COMMENT_KINDS,
  missingProfileItems,
  type ClientProfileValues,
} from "@/lib/client-project"
import { applyDefaultTemplateSet } from "@/lib/automation-templates"
import { after } from "next/server"
import { scheduleKanzleistelleSync } from "@/lib/kanzleistelle-auto-sync"
import { deactivateKanzleistelleJob } from "@/lib/kanzleistelle-profile-sync"
import { loadProfileFieldConfig } from "@/lib/profile-field-config"
import { resolveFields } from "@/lib/profile-fields"

type Result = { error: string } | null
type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>

async function staff(): Promise<{ error: string } | { supabase: Supabase; userId: string }> {
  const supabase = await createSupabaseServerClient()
  const ctx = await getStaffContext(supabase)
  if ("error" in ctx) return ctx
  return { supabase, userId: ctx.staff.userId }
}

function revalidateClient(clientId: string) {
  revalidatePath(`/dashboard/clients/${clientId}`)
}

const clean = (v: unknown) => {
  const t = typeof v === "string" ? v.trim() : ""
  return t === "" ? null : t
}

// ── Phase, Vertrag, Key Account Manager ─────────────────────────────────────

export async function updateProjectMetaAction(
  clientId: string,
  meta: {
    project_phase: string
    contract_start: string | null
    contract_term_months: number | null
    key_account_manager_id: string | null
    close_lead_id: string | null
  }
): Promise<Result> {
  const ctx = await staff()
  if ("error" in ctx) return ctx
  if (!PROJECT_PHASES.some((p) => p.value === meta.project_phase)) return { error: "Ungültige Projektphase." }
  if (meta.contract_term_months !== null && (!Number.isInteger(meta.contract_term_months) || meta.contract_term_months <= 0)) {
    return { error: "Laufzeit bitte als ganze Zahl Monate angeben." }
  }
  const { data: before } = await ctx.supabase.from("clients").select("project_phase").eq("id", clientId).single()
  const { error } = await ctx.supabase
    .from("clients")
    .update({
      project_phase: meta.project_phase,
      contract_start: meta.contract_start || null,
      contract_term_months: meta.contract_term_months,
      key_account_manager_id: meta.key_account_manager_id || null,
      // Close-ID von Hand (bestehende Kunden verknüpfen); Link folgt der ID.
      close_lead_id: clean(meta.close_lead_id),
      close_url: clean(meta.close_lead_id) ? closeLeadUrl(clean(meta.close_lead_id)!) : null,
    })
    .eq("id", clientId)
  if (error?.code === "23505") return { error: "Diese Close-ID ist schon einem anderen Kunden zugeordnet." }
  if (error) return { error: error.message }

  if (before && before.project_phase !== meta.project_phase) await phaseChanged(ctx.supabase, ctx.userId, clientId, before.project_phase, meta.project_phase)
  revalidateClient(clientId)
  return null
}

// Verlaufseintrag und Folgeaufgabe nach einem Phasenwechsel.
async function phaseChanged(supabase: Supabase, userId: string, clientId: string, from: string, to: string) {
  const label = (v: string) => PROJECT_PHASES.find((p) => p.value === v)?.label ?? v
  await supabase.from("client_comments").insert({
    client_id: clientId,
    author_id: userId,
    kind: "system",
    content: `Projektphase geändert: ${label(from)} → ${label(to)}.`,
  })
  if (to === CAMPAIGN_CHECK_TASK.phase) await createCampaignCheckTask(supabase, userId, clientId)
}

// "Kampagnenstatus prüfen" für Elea Günther - nur, wenn nicht schon eine offene
// Aufgabe dieses Namens beim Kunden existiert (Phase hin und her).
async function createCampaignCheckTask(supabase: Supabase, userId: string, clientId: string) {
  const { data: open } = await supabase
    .from("tasks")
    .select("id")
    .eq("client_id", clientId)
    .eq("title", CAMPAIGN_CHECK_TASK.title)
    .neq("status", "erledigt")
    .limit(1)
  if (open && open.length > 0) return
  const { data: assignee } = await supabase.from("profiles").select("id").ilike("email", CAMPAIGN_CHECK_TASK.assigneeEmail).maybeSingle()
  const { data: task, error } = await supabase
    .from("tasks")
    .insert({
      title: CAMPAIGN_CHECK_TASK.title,
      assigned_to: assignee?.id ?? userId,
      created_by: userId,
      client_id: clientId,
      due_date: new Date(Date.now() + 2 * 86400e3).toISOString().slice(0, 10),
    })
    .select("id, assigned_to")
    .single()
  if (error) console.error("Aufgabe Kampagnenstatus prüfen fehlgeschlagen:", error.message)
  else if (task.assigned_to !== userId) await notifyTaskAssigned(supabase, task.id, userId)
}

// ── Kanzleiprofil ───────────────────────────────────────────────────────────

export async function saveClientProfileAction(clientId: string, values: ClientProfileValues): Promise<Result> {
  const ctx = await staff()
  if ("error" in ctx) return ctx
  const row: Record<string, unknown> = { client_id: clientId, updated_at: new Date().toISOString(), updated_by: ctx.userId }
  for (const f of PROFILE_FIELDS) row[f.key] = clean(values[f.key])
  row.benefits = (values.benefits ?? []).map((b) => b.trim()).filter(Boolean)
  row.extra = cleanExtra(values.extra)
  const { error } = await ctx.supabase.from("client_profiles").upsert(row as never, { onConflict: "client_id" })
  if (error) return { error: error.message }
  scheduleKanzleistelleSync(clientId)
  revalidateClient(clientId)
  return null
}

export async function finalizeClientProfileAction(clientId: string, finalize: boolean): Promise<Result> {
  const ctx = await staff()
  if ("error" in ctx) return ctx
  if (finalize) {
    const [{ data: profile }, { data: positionRows }, { count: locationCount }, config] = await Promise.all([
      ctx.supabase.from("client_profiles").select("*").eq("client_id", clientId).maybeSingle(),
      ctx.supabase.from("client_positions").select("title, berufsbild, plz, arbeitszeit, berufserfahrung, software, gehalt, startdatum, aufgaben, anforderungen, extra").eq("client_id", clientId),
      ctx.supabase.from("client_locations").select("id", { count: "exact", head: true }).eq("client_id", clientId),
      loadProfileFieldConfig(ctx.supabase),
    ])
    const missing = missingProfileItems(profile as ClientProfileValues | null, positionRows ?? [], locationCount ?? 0, {
      kanzlei: resolveFields("kanzlei", config.settings),
      stelle: resolveFields("stelle", config.settings),
    })
    if (missing.length > 0) return { error: `Noch offen: ${missing.join(", ")}` }
  }
  const { error } = await ctx.supabase
    .from("client_profiles")
    .upsert(
      { client_id: clientId, finalized_at: finalize ? new Date().toISOString() : null, finalized_by: finalize ? ctx.userId : null },
      { onConflict: "client_id" }
    )
  if (error) return { error: error.message }
  await ctx.supabase.from("client_comments").insert({
    client_id: clientId,
    author_id: ctx.userId,
    kind: "system",
    content: finalize ? "Kanzleiprofil abgeschlossen." : "Kanzleiprofil wieder zur Bearbeitung geöffnet.",
  })
  if (finalize) {
    // Mit dem abgeschlossenen Kanzleiprofil ist das Onboarding vorbei: weiter zur Kampagnenvorbereitung.
    const { data: moved } = await ctx.supabase
      .from("clients")
      .update({ project_phase: CAMPAIGN_CHECK_TASK.phase })
      .eq("id", clientId)
      .eq("project_phase", "onboarding")
      .select("id")
    if (moved?.length) await phaseChanged(ctx.supabase, ctx.userId, clientId, "onboarding", CAMPAIGN_CHECK_TASK.phase)
    scheduleKanzleistelleSync(clientId)
  }
  revalidateClient(clientId)
  return null
}

// ── Gesuchte Stellen ────────────────────────────────────────────────────────

export interface PositionInput {
  id?: string
  title: string
  berufsbild: string | null
  plz: string | null
  ort: string | null
  radius_km: number | null
  arbeitszeit: string | null
  berufserfahrung: string | null
  software: string | null
  gehalt: string | null
  startdatum: string | null
  anforderungen: string | null
  aufgaben: string | null
  // Werte eigener Felder des Stellenprofils (Paket 18, T-80).
  extra?: Record<string, string> | null
}

function cleanExtra(extra: Record<string, string> | null | undefined): Record<string, string> {
  return Object.fromEntries(Object.entries(extra ?? {}).map(([k, v]) => [k, (v ?? "").trim()]).filter(([, v]) => v))
}

export async function savePositionAction(clientId: string, input: PositionInput): Promise<Result> {
  const ctx = await staff()
  if ("error" in ctx) return ctx
  const title = clean(input.title)
  if (!title) return { error: "Bezeichnung der Stelle fehlt." }
  const plz = clean(input.plz)
  if (plz && !/^\d{5}$/.test(plz)) return { error: "PLZ bitte fünfstellig angeben." }
  const coords = plz ? geocodePlz(plz) : null
  const row = {
    client_id: clientId,
    title,
    berufsbild: clean(input.berufsbild),
    plz,
    ort: clean(input.ort),
    lat: coords?.lat ?? null,
    lng: coords?.lng ?? null,
    radius_km: input.radius_km && input.radius_km > 0 ? Math.round(input.radius_km) : null,
    arbeitszeit: clean(input.arbeitszeit),
    berufserfahrung: clean(input.berufserfahrung),
    software: clean(input.software),
    gehalt: clean(input.gehalt),
    startdatum: clean(input.startdatum),
    anforderungen: clean(input.anforderungen),
    aufgaben: clean(input.aufgaben),
    extra: cleanExtra(input.extra),
    updated_at: new Date().toISOString(),
  }
  const { error } = input.id
    ? await ctx.supabase.from("client_positions").update(row).eq("id", input.id).eq("client_id", clientId)
    : await ctx.supabase.from("client_positions").insert(row)
  if (error) return { error: error.message }
  // Neue PLZ -> weiterer Standort des Kunden (Paket 16, T-75), damit Karte und
  // Stammdaten stimmen.
  if (plz) await ensureClientLocation(ctx.supabase, clientId, { plz, ort: row.ort })
  scheduleKanzleistelleSync(clientId)
  revalidateClient(clientId)
  return null
}

// Stelle kopieren (Paket 13): ohne Ort = 1:1 duplizieren, mit Ort = dieselbe Stelle an
// einem weiteren Standort. Die Kopie hängt an keiner Kampagne.
export async function duplicatePositionAction(
  clientId: string,
  positionId: string,
  location: { plz: string; ort: string; radius_km: number | null } | null
): Promise<Result> {
  const ctx = await staff()
  if ("error" in ctx) return ctx
  const { data: p, error: loadError } = await ctx.supabase.from("client_positions").select("*").eq("id", positionId).eq("client_id", clientId).single()
  if (loadError || !p) return { error: loadError?.message ?? "Stelle nicht gefunden." }
  let place = { plz: p.plz, ort: p.ort, lat: p.lat, lng: p.lng, radius_km: p.radius_km }
  if (location) {
    const plz = clean(location.plz)
    if (!plz || !/^\d{5}$/.test(plz)) return { error: "Bitte eine fünfstellige PLZ für den weiteren Standort angeben." }
    const coords = geocodePlz(plz)
    place = { plz, ort: clean(location.ort), lat: coords?.lat ?? null, lng: coords?.lng ?? null, radius_km: location.radius_km ?? p.radius_km }
  }
  const { id: _id, created_at: _c, updated_at: _u, campaign_id: _k, ...rest } = p
  void _id
  void _c
  void _u
  void _k
  const { error } = await ctx.supabase.from("client_positions").insert({ ...rest, ...place, campaign_id: null })
  if (error) return { error: error.message }
  if (place.plz) await ensureClientLocation(ctx.supabase, clientId, { plz: place.plz, ort: place.ort })
  scheduleKanzleistelleSync(clientId)
  revalidateClient(clientId)
  return null
}

export async function deletePositionAction(clientId: string, positionId: string): Promise<Result> {
  const ctx = await staff()
  if ("error" in ctx) return ctx
  const { data: removed, error } = await ctx.supabase
    .from("client_positions")
    .delete()
    .eq("id", positionId)
    .eq("client_id", clientId)
    .select("kanzleistelle_job_id")
    .maybeSingle()
  if (error) return { error: error.message }
  // Anzeige auf Kanzleistelle24 deaktivieren (Paket 16, T-52).
  if (removed?.kanzleistelle_job_id) {
    const jobId = removed.kanzleistelle_job_id
    after(() => deactivateKanzleistelleJob(jobId))
  }
  revalidateClient(clientId)
  return null
}

// Legt aus einer oder mehreren Stellen EINE Kanzlei-Kampagne an (mehrere Stellen =
// zusammengelegt). Berufsbild/Haupt-Standort/Umkreis kommen von der ersten Stelle, die PLZ
// der übrigen Stellen werden weitere Standorte fürs Matching (Paket 40).
export async function createCampaignFromPositionsAction(
  clientId: string,
  positionIds: string[],
  title: string
): Promise<{ error: string } | { campaignId: string }> {
  const ctx = await staff()
  if ("error" in ctx) return ctx
  if (positionIds.length === 0) return { error: "Keine Stelle ausgewählt." }
  const { data: positions, error: loadError } = await ctx.supabase
    .from("client_positions")
    .select("id, title, berufsbild, plz, lat, lng, radius_km, campaign_id")
    .eq("client_id", clientId)
    .in("id", positionIds)
  if (loadError) return { error: loadError.message }
  if (!positions || positions.length === 0) return { error: "Stellen nicht gefunden." }
  if (positions.some((p) => p.campaign_id)) return { error: "Mindestens eine Stelle hängt schon an einer Kampagne." }

  const first = positions[0]
  const berufsbild = positions.find((p) => p.berufsbild)?.berufsbild ?? null
  if (!berufsbild) return { error: "Bitte bei der Stelle zuerst das Berufsbild setzen." }
  const { data: client } = await ctx.supabase.from("clients").select("plz, agency_id").eq("id", clientId).single()
  const plz = first.plz ?? client?.plz ?? null
  const coords = first.lat !== null && first.lng !== null ? { lat: first.lat, lng: first.lng } : plz ? geocodePlz(plz) : null

  const { data: campaign, error } = await ctx.supabase
    .from("campaigns")
    .insert({
      title: clean(title) ?? positions.map((p) => p.title).join(" / "),
      client_id: clientId,
      kind: "kanzlei",
      status: "active",
      berufsbild,
      plz,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      location_id: await getOrCreateLocationForPlz(ctx.supabase, plz),
      extra_plz: parsePlzList(positions.map((p) => p.plz ?? ""), plz),
      ...(first.radius_km ? { radius_km: first.radius_km } : {}),
    })
    .select("id")
    .single()
  if (error) return { error: error.message }
  await applyDefaultTemplateSet(ctx.supabase, campaign.id)

  const { error: linkError } = await ctx.supabase.from("client_positions").update({ campaign_id: campaign.id }).in("id", positionIds)
  if (linkError) return { error: linkError.message }
  revalidateClient(clientId)
  return { campaignId: campaign.id }
}

// Stelle mit bestehender Kanzlei-Kampagne des Kunden verknüpfen (oder lösen: null).
export async function linkPositionToCampaignAction(clientId: string, positionId: string, campaignId: string | null): Promise<Result> {
  const ctx = await staff()
  if ("error" in ctx) return ctx
  if (campaignId) {
    const { data: campaign } = await ctx.supabase.from("campaigns").select("id").eq("id", campaignId).eq("client_id", clientId).eq("kind", "kanzlei").maybeSingle()
    if (!campaign) return { error: "Kampagne gehört nicht zu diesem Kunden." }
  }
  const { error } = await ctx.supabase.from("client_positions").update({ campaign_id: campaignId }).eq("id", positionId).eq("client_id", clientId)
  if (error) return { error: error.message }
  // Stelle an anderem Ort: ihre PLZ wird weiterer Standort der Kampagne (Paket 40).
  if (campaignId) {
    const [{ data: position }, { data: campaign }] = await Promise.all([
      ctx.supabase.from("client_positions").select("plz").eq("id", positionId).single(),
      ctx.supabase.from("campaigns").select("plz, extra_plz").eq("id", campaignId).single(),
    ])
    const extra = parsePlzList([...(campaign?.extra_plz ?? []), position?.plz ?? ""], campaign?.plz)
    if (campaign && extra.join() !== (campaign.extra_plz ?? []).join()) {
      await ctx.supabase.from("campaigns").update({ extra_plz: extra }).eq("id", campaignId)
      await matchCampaignToCandidates(ctx.supabase, campaignId).catch((e) => console.error("Matching fehlgeschlagen:", e))
    }
  }
  revalidateClient(clientId)
  return null
}

// ── Kommentare ──────────────────────────────────────────────────────────────

// next.config: serverActions.bodySizeLimit 10 MB (für alle Anhänge eines Kommentars zusammen).
const MAX_FILE_BYTES = 10 * 1024 * 1024

export async function addCommentAction(clientId: string, formData: FormData): Promise<Result> {
  const ctx = await staff()
  if ("error" in ctx) return ctx
  const content = clean(formData.get("content"))
  const kind = (formData.get("kind") as string) || "notiz"
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0)
  if (!content && files.length === 0) return { error: "Kommentar ist leer." }
  if (!COMMENT_KINDS.some((k) => k.value === kind)) return { error: "Ungültige Art." }
  if (files.reduce((sum, f) => sum + f.size, 0) > MAX_FILE_BYTES) return { error: "Anhänge dürfen zusammen höchstens 10 MB groß sein." }
  let mentions: string[] = []
  try {
    mentions = JSON.parse((formData.get("mentions") as string) || "[]")
  } catch {
    mentions = []
  }

  // Antwort (Paket 50): immer an den obersten Kommentar desselben Kunden (eine Ebene).
  let parentId: string | null = null
  const rawParent = (formData.get("parent_id") as string) || null
  if (rawParent) {
    const { data: parent } = await ctx.supabase.from("client_comments").select("id, parent_id, client_id").eq("id", rawParent).maybeSingle()
    if (!parent || parent.client_id !== clientId) return { error: "Kommentar nicht gefunden." }
    parentId = parent.parent_id ?? parent.id
  }

  const { data: comment, error } = await ctx.supabase
    .from("client_comments")
    .insert({ client_id: clientId, author_id: ctx.userId, kind, content: content ?? "(Anhang)", mentions, parent_id: parentId })
    .select("id")
    .single()
  if (error) return { error: error.message }

  for (const file of files) {
    const path = `${clientId}/kommentare/${comment.id}/${Date.now()}-${file.name}`
    const { error: uploadError } = await ctx.supabase.storage
      .from("client-files")
      .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type })
    if (uploadError) return { error: `Anhang ${file.name}: ${uploadError.message}` }
    await ctx.supabase.from("client_files").insert({
      client_id: clientId,
      comment_id: comment.id,
      file_name: file.name,
      file_path: path,
      file_size: file.size,
      mime_type: file.type || null,
    })
  }

  if (mentions.length > 0) await notifyMentions(ctx.supabase, ctx.userId, clientId, mentions, content ?? "")
  revalidateClient(clientId)
  return null
}

// Reaktion setzen oder zurücknehmen (Paket 50).
const REACTIONS = new Set(["👍", "❤️", "🎉", "👀", "✅"])
export async function toggleCommentReactionAction(clientId: string, commentId: string, emoji: string): Promise<Result> {
  const ctx = await staff()
  if ("error" in ctx) return ctx
  if (!REACTIONS.has(emoji)) return { error: "Unbekannte Reaktion." }
  const { data: existing } = await ctx.supabase
    .from("client_comment_reactions")
    .select("comment_id")
    .eq("comment_id", commentId)
    .eq("user_id", ctx.userId)
    .eq("emoji", emoji)
    .maybeSingle()
  const { error } = existing
    ? await ctx.supabase.from("client_comment_reactions").delete().eq("comment_id", commentId).eq("user_id", ctx.userId).eq("emoji", emoji)
    : await ctx.supabase.from("client_comment_reactions").insert({ comment_id: commentId, user_id: ctx.userId, emoji })
  if (error) return { error: error.message }
  revalidateClient(clientId)
  return null
}

export async function updateCommentAction(clientId: string, commentId: string, content: string, kind: string): Promise<Result> {
  const ctx = await staff()
  if ("error" in ctx) return ctx
  const text = clean(content)
  if (!text) return { error: "Kommentar ist leer." }
  if (!COMMENT_KINDS.some((k) => k.value === kind)) return { error: "Ungültige Art." }
  // RLS erlaubt nur eigene Kommentare (Admins alle).
  const { data, error } = await ctx.supabase
    .from("client_comments")
    .update({ content: text, kind, edited_at: new Date().toISOString() })
    .eq("id", commentId)
    .select("id")
  if (error) return { error: error.message }
  if (!data || data.length === 0) return { error: "Nur eigene Kommentare können bearbeitet werden." }
  revalidateClient(clientId)
  return null
}

export async function deleteCommentAction(clientId: string, commentId: string): Promise<Result> {
  const ctx = await staff()
  if ("error" in ctx) return ctx
  const { data: files } = await ctx.supabase.from("client_files").select("file_path").eq("comment_id", commentId)
  const { data, error } = await ctx.supabase.from("client_comments").delete().eq("id", commentId).select("id")
  if (error) return { error: error.message }
  if (!data || data.length === 0) return { error: "Nur eigene Kommentare können gelöscht werden." }
  if (files && files.length > 0) await ctx.supabase.storage.from("client-files").remove(files.map((f) => f.file_path))
  revalidateClient(clientId)
  return null
}

export async function getCommentFileUrlAction(filePath: string): Promise<{ error: string } | { url: string }> {
  const ctx = await staff()
  if ("error" in ctx) return ctx
  const { data, error } = await ctx.supabase.storage.from("client-files").createSignedUrl(filePath, 300)
  if (error || !data) return { error: error?.message ?? "Datei nicht gefunden." }
  return { url: data.signedUrl }
}

async function notifyMentions(supabase: Supabase, authorId: string, clientId: string, mentionIds: string[], content: string) {
  try {
    const [{ data: people }, { data: author }, { data: client }] = await Promise.all([
      supabase.from("profiles").select("id, email, role").in("id", mentionIds),
      supabase.from("profiles").select("full_name").eq("id", authorId).maybeSingle(),
      supabase.from("clients").select("name").eq("id", clientId).maybeSingle(),
    ])
    const recipients = (people ?? []).filter((p) => p.email && p.role !== "client" && p.id !== authorId).map((p) => p.email as string)
    if (recipients.length === 0) return
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://kandidatenwerk.kanzleistelle24.de"
    const escape = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    await sendEmail(
      recipients,
      `${author?.full_name ?? "Jemand"} hat dich bei ${client?.name ?? "einem Kunden"} erwähnt`,
      `<p>${escape(author?.full_name ?? "Jemand")} hat dich in einem Kommentar zu <strong>${escape(client?.name ?? "")}</strong> erwähnt:</p>
<blockquote style="border-left:3px solid #dde3ea;margin:0;padding:4px 12px;color:#374151">${escape(content).replace(/\n/g, "<br>")}</blockquote>
<p><a href="${appUrl}/dashboard/clients/${clientId}?tab=projekt">Zum Kunden</a></p>`
    )
  } catch (err) {
    console.error("Erwähnungs-Mail fehlgeschlagen:", err)
  }
}
