import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { createSupabaseAdminClient } from "@/lib/supabase-admin"
import { NotesSection, type Note } from "./notes-section"
import { PortalFilesList, type PortalFile } from "./files-list"
import { PortalStatusSelector } from "./status-selector"
import { resolveTemplateFieldKeys } from "@/lib/field-templates"
import { BERUFSBILD_OPTIONS } from "@/lib/berufsbild"
import { isPortalVisible } from "@/lib/portal-visibility"

export default async function PortalCandidateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()

  const [{ data: candidate }, { data: assignment }] = await Promise.all([
    // RLS ("Kunde sieht zugeordnete Kandidaten") liefert hier automatisch nur etwas
    // zurück, wenn der Kandidat diesem Kunden auch wirklich aktiv zugeordnet ist -
    // sonst kommt einfach null zurück, kein Fehler.
    supabase.from("candidates").select("*").eq("id", id).single(),
    supabase
      .from("client_assignments")
      .select("id, status, client_id, campaign_id")
      .eq("candidate_id", id)
      .is("removed_at", null)
      .limit(1)
      .maybeSingle(),
  ])

  if (!candidate || !assignment || !isPortalVisible(candidate)) notFound()

  // Zusatzfelder-Definitionen (Umbau vom 25.09.2026, Schritt 2/3) - bewusst per
  // Service-Role-Client statt über die RLS-Session des Portal-Nutzers gelesen:
  // Portal-Kunden haben agency_id = NULL (Sicherheitsvorfall 22.09.2026), eine
  // RLS-Lockerung dafür kommt nicht infrage. Die Agentur wird stattdessen sicher
  // server-seitig über die bereits RLS-geprüfte Zuordnung (assignment.client_id)
  // hergeleitet, kein Nutzereingabe-Pfad.
  const admin = createSupabaseAdminClient()
  const { data: assignedClient } = await admin
    .from("clients")
    .select("agency_id")
    .eq("id", assignment.client_id)
    .maybeSingle()

  const { data: customFieldDefinitionRows } = assignedClient?.agency_id
    ? await admin
        .from("custom_field_definitions")
        .select("id, key, label, sort_order, section")
        .eq("agency_id", assignedClient.agency_id)
        .eq("active", true)
        .order("sort_order", { ascending: true })
    : { data: [] }
  const allFieldDefinitions = customFieldDefinitionRows ?? []

  // Feld-Vorlage der Kanzlei-Kampagne, über die der Kandidat zugeordnet ist (Paket 8).
  const [{ data: templateRows }, { data: assignmentCampaign }] = await Promise.all([
    assignedClient?.agency_id
      ? admin.from("field_templates").select("id, field_keys, is_default").eq("agency_id", assignedClient.agency_id)
      : Promise.resolve({ data: [] }),
    assignment.campaign_id
      ? admin.from("campaigns").select("field_template_id").eq("id", assignment.campaign_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  const templateKeys = resolveTemplateFieldKeys(
    templateRows ?? [],
    assignment.campaign_id ? [assignmentCampaign?.field_template_id ?? null] : []
  )
  const stammdatenFieldDefinitions = allFieldDefinitions.filter((f) => f.section === "stammdaten")
  const zusatzFieldDefinitions = allFieldDefinitions.filter((f) => f.section !== "stammdaten")
  const customFieldDefinitions = templateKeys
    ? templateKeys.map((k) => zusatzFieldDefinitions.find((f) => f.key === k)).filter((f): f is (typeof zusatzFieldDefinitions)[number] => !!f)
    : zusatzFieldDefinitions

  const { data: fileRows } = await supabase
    .from("candidate_files")
    .select("id, file_name, file_path, file_size, mime_type, created_at")
    .eq("candidate_id", id)
    .order("created_at", { ascending: false })

  const files: PortalFile[] = await Promise.all(
    (fileRows ?? []).map(async (f) => {
      const { data: urlData } = await supabase.storage
        .from("candidate-files")
        .createSignedUrl(f.file_path, 3600)
      return {
        id: f.id,
        name: f.file_name,
        size: f.file_size,
        mime_type: f.mime_type,
        created_at: f.created_at,
        signedUrl: urlData?.signedUrl ?? null,
      }
    })
  )

  const { data: noteRows } = await supabase
    .from("client_assignment_notes")
    .select("id, content, created_at, author_id")
    .eq("client_assignment_id", assignment.id)
    .order("created_at", { ascending: true })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const notes: Note[] = (noteRows ?? []).map((n) => ({
    id: n.id,
    content: n.content,
    created_at: n.created_at,
    isOwn: n.author_id === user?.id,
  }))

  const customFields = (candidate.custom_fields as Record<string, string> | null) ?? {}

  return (
    <div className="p-4 sm:p-6 max-w-6xl">
      <Link href="/portal/candidates" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft size={15} />
        Zurück zu meinen Kandidaten
      </Link>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-gray-900">
          {candidate.first_name} {candidate.last_name}
        </h1>
        <PortalStatusSelector clientAssignmentId={assignment.id} currentStatus={assignment.status} />
      </div>

      {/* Zweispaltig ab lg: rechts die Beschreibung (Paket 15, T-72) - unsere Einschätzung
          und Notizen zum Kandidaten, die der Kunde bisher nicht sah. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="order-2 min-w-0 lg:order-1">
          <div className="rounded-xl border bg-white p-6 mb-4" style={{ borderColor: "#dde3ea" }}>
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Stammdaten</span>
            <div className="mt-3 flex flex-col gap-2.5">
              <FieldRow label="Berufsbild">{BERUFSBILD_OPTIONS.find((o) => o.value === candidate.berufsbild)?.label ?? (candidate.berufsbild || "—")}</FieldRow>
              <FieldRow label="E-Mail">{candidate.email || "—"}</FieldRow>
              <FieldRow label="Telefon">{candidate.phone || "—"}</FieldRow>
              <FieldRow label="PLZ">{candidate.plz || "—"}</FieldRow>
              {stammdatenFieldDefinitions.map((f) => (
                <FieldRow key={f.key} label={f.label}>
                  {customFields[f.key]?.trim() || "—"}
                </FieldRow>
              ))}
            </div>
          </div>

          <div className="rounded-xl border bg-white p-6 mb-4" style={{ borderColor: "#dde3ea" }}>
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Zusatzfelder</span>
            {/* Gleiches Boxen-Layout wie die Zusatzfelder im internen Kandidatenprofil
                (profile-tab.tsx) - hier bewusst als reine, nicht-interaktive Anzeige statt
                editierbarer Inputs, damit für den Kunden nicht der Eindruck entsteht, er
                könnte die Werte hier ändern. */}
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {customFieldDefinitions.map((f) => {
                const value = customFields[f.key]?.trim()
                return (
                  <div key={f.key} className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-gray-400">{f.label}</span>
                    <div
                      className="rounded-md border px-3 py-1.5 text-sm text-gray-900"
                      style={{ borderColor: "#dde3ea", backgroundColor: "#f9fafb" }}
                    >
                      {value || "—"}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {files.length > 0 && (
            <div className="rounded-xl border bg-white p-6 mb-4" style={{ borderColor: "#dde3ea" }}>
              <PortalFilesList files={files} />
            </div>
          )}

          <div className="rounded-xl border bg-white p-6" style={{ borderColor: "#dde3ea" }}>
            <NotesSection clientAssignmentId={assignment.id} notes={notes} />
          </div>
        </div>

        <aside className="order-1 lg:order-2 lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-xl border bg-white p-6" style={{ borderColor: "#dde3ea" }}>
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Beschreibung</span>
            {/* "Beschreibung" im Backend ist das Feld notes (Fix Paket 18). */}
            {candidate.notes?.trim() ? (
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-gray-800">{candidate.notes.trim()}</p>
            ) : (
              <p className="mt-3 text-sm text-gray-400">Noch keine Beschreibung hinterlegt.</p>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <div className="shrink-0 text-sm text-gray-500" style={{ minWidth: "9rem" }}>
        {label}
      </div>
      <div className="text-sm text-gray-900">{children}</div>
    </div>
  )
}
