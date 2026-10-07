import { notFound } from "next/navigation"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { CandidateDetail } from "./candidate-detail"
import { resolveTemplateFieldKeys } from "@/lib/field-templates"

export default async function CandidateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()

  const [
    { data: candidate },
    { data: history },
    { data: fileRows },
    { data: assignmentRows },
    { data: clientRows },
    { data: profileRows },
    { data: customFieldDefinitionRows },
    { data: kanzleiCampaignRows },
  ] = await Promise.all([
    supabase
      .from("candidates")
      .select("*, campaigns(title, kind, berufsbild, clients(id, name))")
      .eq("id", id)
      .single(),
    supabase
      .from("candidate_history")
      .select("*")
      .eq("candidate_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("candidate_files")
      .select("*")
      .eq("candidate_id", id)
      .order("created_at", { ascending: false }),
    // Alle aktiven Zuordnungen (nicht mehr nur eine) - ein Kandidat kann jetzt
    // gleichzeitig mehreren Kanzleien zugeordnet sein, siehe assignToCampaignAction.
    supabase
      .from("client_assignments")
      .select("id, status, client_id, campaign_id, campaigns(title, field_template_id)")
      .eq("candidate_id", id)
      .is("removed_at", null),
    supabase
      .from("clients")
      .select("id, name")
      .order("name", { ascending: true }),
    // Für das "Aufgabe erstellen"-Popup direkt auf der Kandidatenseite (Zuweisen-an-Dropdown).
    // Nur Team-Mitglieder sind als Zuständige wählbar (keine Portal-Kunden).
    supabase.from("profiles").select("id, full_name").in("role", ["agency_admin", "agency_member"]).order("full_name", { ascending: true }),
    // Ersetzt FIXED_CUSTOM_FIELDS (candidate-custom-fields.ts) als Quelle für die
    // Zusatzfelder-Anzeige - kein .eq("agency_id", ...) nötig, RLS schränkt bereits auf
    // die eigene Agentur ein (siehe custom_field_definitions-Policies). ALLE
    // Definitionen (aktiv + inaktiv) werden geladen: profile-tab.tsx zeigt nur die
    // aktiven als Boxen, braucht aber auch die inaktiven Keys, damit ein Wert unter
    // einem gerade deaktivierten Feld nicht fälschlich unter "Weitere Felder" auftaucht.
    supabase
      .from("custom_field_definitions")
      .select("id, key, label, sort_order, active, section")
      .order("sort_order", { ascending: true }),
    // Ziele für "Weiterschieben" im Reiter Zuordnung: alle aktiven Kanzlei-Kampagnen.
    supabase
      .from("campaigns")
      .select("id, title, berufsbild, client_id, lat, lng, clients(name)")
      .eq("kind", "kanzlei")
      .eq("status", "active")
      .eq("is_demo", false)
      .order("title", { ascending: true }),
  ])

  if (!candidate) notFound()

  const creatorIds = [...new Set((history ?? []).map((h) => h.created_by).filter((id): id is string => id !== null))]
  const { data: creatorProfiles } =
    creatorIds.length > 0
      ? await supabase.from("profiles").select("id, full_name").in("id", creatorIds)
      : { data: [] }
  const creatorNameById = new Map((creatorProfiles ?? []).map((p) => [p.id, p.full_name]))

  const historyWithCreatorNames = (history ?? []).map((h) => ({
    id: h.id,
    type: h.type,
    content: h.content,
    created_at: h.created_at,
    createdByName: h.created_by ? (creatorNameById.get(h.created_by) ?? null) : null,
  }))

  // Eigene Notizen des Kunden im Portal (client_assignment_notes) - erst hier, nicht im
  // Promise.all oben, da wir die IDs der aktiven Zuordnungen (assignmentRows) brauchen.
  // Kundenname wird bewusst aus den bereits geladenen assignmentRows/clientRows aufgelöst
  // (statt einer zusätzlichen profiles-Abfrage für den einzelnen Portal-Autor) - braucht
  // keine weitere Datenbankabfrage.
  const assignmentIds = (assignmentRows ?? []).map((a) => a.id)
  const { data: clientNoteRows } =
    assignmentIds.length > 0
      ? await supabase
          .from("client_assignment_notes")
          .select("id, client_assignment_id, content, created_at")
          .in("client_assignment_id", assignmentIds)
          .order("created_at", { ascending: false })
      : { data: [] }

  const clientIdByAssignmentId = new Map((assignmentRows ?? []).map((a) => [a.id, a.client_id]))
  const clientNameById = new Map((clientRows ?? []).map((c) => [c.id, c.name]))
  const clientNotes = (clientNoteRows ?? []).map((n) => {
    const clientId = clientIdByAssignmentId.get(n.client_assignment_id) ?? null
    return {
      id: n.id,
      content: n.content,
      created_at: n.created_at,
      clientName: clientId ? (clientNameById.get(clientId) ?? "Unbekannter Kunde") : "Unbekannter Kunde",
    }
  })

  const files = await Promise.all(
    (fileRows ?? []).map(async (f) => {
      const { data: urlData } = await supabase.storage
        .from("candidate-files")
        .createSignedUrl(f.file_path, 3600)
      return {
        id: f.id,
        name: f.file_name,
        storage_path: f.file_path,
        size: f.file_size,
        mime_type: f.mime_type,
        created_at: f.created_at,
        signedUrl: urlData?.signedUrl ?? null,
      }
    })
  )

  type CampaignJoin = {
    title: string
    kind: string
    berufsbild: string | null
    clients: { id: string; name: string } | null
  } | null
  const campaigns = candidate.campaigns as CampaignJoin

  const candidateData = {
    id: candidate.id,
    first_name: candidate.first_name,
    last_name: candidate.last_name,
    email: candidate.email,
    phone: candidate.phone,
    status: candidate.status,
    source: candidate.source,
    notes: candidate.notes,
    tags: candidate.tags ?? [],
    description: candidate.description,
    berufsbild: candidate.berufsbild ?? null,
    plz: candidate.plz ?? null,
    lat: candidate.lat ?? null,
    lng: candidate.lng ?? null,
    custom_fields: (candidate.custom_fields as Record<string, string> | null) ?? null,
    is_demo: candidate.is_demo ?? false,
    campaign_id: candidate.campaign_id,
    campaigns: campaigns,
  }

  const activeAssignments = (assignmentRows ?? []).map((a) => {
    const campaignRel = a.campaigns as { title: string } | { title: string }[] | null
    const campaign = Array.isArray(campaignRel) ? campaignRel[0] ?? null : campaignRel
    return {
      id: a.id,
      clientId: a.client_id,
      status: a.status,
      campaignId: a.campaign_id,
      campaignTitle: campaign?.title ?? null,
    }
  })

  const kanzleiCampaigns = (kanzleiCampaignRows ?? []).map((c) => {
    const clientRel = c.clients as { name: string } | { name: string }[] | null
    const client = Array.isArray(clientRel) ? clientRel[0] ?? null : clientRel
    return {
      id: c.id,
      title: c.title,
      berufsbild: c.berufsbild,
      clientId: c.client_id,
      clientName: client?.name ?? "Unbekannter Kunde",
      lat: c.lat ?? null,
      lng: c.lng ?? null,
    }
  })

  // Feld-Vorlagen der zugeordneten Kanzlei-Kampagnen bestimmen die Zusatzfelder (Paket 8).
  const { data: templateRows } = await supabase.from("field_templates").select("id, field_keys, is_default")
  const templateFieldKeys = resolveTemplateFieldKeys(
    templateRows ?? [],
    (assignmentRows ?? [])
      .filter((a) => a.campaign_id)
      .map((a) => (Array.isArray(a.campaigns) ? a.campaigns[0] : a.campaigns)?.field_template_id ?? null)
  )

  const clients = (clientRows ?? []).map((c) => ({ id: c.id, name: c.name }))
  const profiles = (profileRows ?? []).map((p) => ({ id: p.id, full_name: p.full_name }))

  // Reiter "Kommunikation" (Paket 18, T-84): verschickte Mails, Vorlagen an "Kandidat",
  // Platzhalter-Werte für die Vorlagen.
  const [{ data: messageRows }, { data: messageTemplateRows }, { data: tagRows }] = await Promise.all([
    supabase.from("candidate_messages").select("*").eq("candidate_id", id).order("created_at", { ascending: false }),
    supabase.from("automation_templates").select("id, name, subject, body_html").eq("recipient", "candidate").order("name"),
    supabase.from("candidate_tag_list").select("tag").order("tag"),
  ])
  const knownTags = (tagRows ?? []).map((r) => r.tag).filter((t): t is string => !!t)
  const firstAssignment = (assignmentRows ?? [])[0]
  const assignmentCampaign = firstAssignment
    ? ((Array.isArray(firstAssignment.campaigns) ? firstAssignment.campaigns[0] : firstAssignment.campaigns) as { title: string } | null)
    : null
  const communication = {
    vars: {
      Kandidatenname: `${candidate.first_name} ${candidate.last_name}`.trim(),
      Kampagnenname: campaigns?.title ?? assignmentCampaign?.title ?? "",
      Kundenname: campaigns?.clients?.name ?? clients.find((c) => c.id === firstAssignment?.client_id)?.name ?? "",
      Email: candidate.email ?? "",
      Telefon: candidate.phone ?? "",
      Bewerberlink: "",
    },
    templates: (messageTemplateRows ?? []).map((t) => ({ id: t.id, name: t.name, subject: t.subject, body: t.body_html })),
    messages: (messageRows ?? []).map((m) => ({
      id: m.id,
      channel: m.channel,
      direction: m.direction,
      fromAddress: m.from_address,
      toAddress: m.to_address,
      subject: m.subject,
      body: m.body,
      senderName: profiles.find((p) => p.id === m.sent_by)?.full_name ?? null,
      status: m.status,
      error: m.error,
      createdAt: m.created_at,
    })),
  }

  return (
    <CandidateDetail
      candidate={candidateData}
      history={historyWithCreatorNames}
      files={files}
      activeAssignments={activeAssignments}
      clients={clients}
      clientNotes={clientNotes}
      profiles={profiles}
      customFieldDefinitions={customFieldDefinitionRows ?? []}
      templateFieldKeys={templateFieldKeys}
      kanzleiCampaigns={kanzleiCampaigns}
      communication={communication}
      knownTags={knownTags}
    />
  )
}
