import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { FIXED_CUSTOM_FIELDS } from "@/lib/candidate-custom-fields"
import { NotesSection, type Note } from "./notes-section"
import { PortalFilesList, type PortalFile } from "./files-list"

const STATUS_LABELS: Record<string, string> = {
  inbox: "Unbearbeitet",
  vq: "Vorqualifiziert",
  vqk: "Vorqualifiziert beim Kunden",
  vg: "Vorstellungsgespräch",
  ja: "Ja",
  nein: "Nein",
}

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
      .select("id, status")
      .eq("candidate_id", id)
      .is("removed_at", null)
      .limit(1)
      .maybeSingle(),
  ])

  if (!candidate || !assignment) notFound()

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
  const filledCustomFields = FIXED_CUSTOM_FIELDS.filter((f) => customFields[f.key]?.trim())

  return (
    <div className="p-6 max-w-3xl">
      <Link href="/portal" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft size={15} />
        Zurück zu meinen Kandidaten
      </Link>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">
          {candidate.first_name} {candidate.last_name}
        </h1>
        <span
          className="rounded-full px-3 py-1 text-xs font-medium"
          style={{ backgroundColor: "#1e56a018", color: "#1e56a0" }}
        >
          {STATUS_LABELS[assignment.status] ?? assignment.status}
        </span>
      </div>

      <div className="rounded-xl border bg-white p-6 mb-4" style={{ borderColor: "#dde3ea" }}>
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Stammdaten</span>
        <div className="mt-3 flex flex-col gap-2.5">
          <FieldRow label="Berufsbild">{candidate.berufsbild || "—"}</FieldRow>
          <FieldRow label="E-Mail">{candidate.email || "—"}</FieldRow>
          <FieldRow label="Telefon">{candidate.phone || "—"}</FieldRow>
          <FieldRow label="PLZ">{candidate.plz || "—"}</FieldRow>
        </div>
      </div>

      {filledCustomFields.length > 0 && (
        <div className="rounded-xl border bg-white p-6 mb-4" style={{ borderColor: "#dde3ea" }}>
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Zusatzfelder</span>
          <div className="mt-3 flex flex-col gap-2.5">
            {filledCustomFields.map((f) => (
              <FieldRow key={f.key} label={f.label}>
                {customFields[f.key]}
              </FieldRow>
            ))}
          </div>
        </div>
      )}

      {files.length > 0 && (
        <div className="rounded-xl border bg-white p-6 mb-4" style={{ borderColor: "#dde3ea" }}>
          <PortalFilesList files={files} />
        </div>
      )}

      <div className="rounded-xl border bg-white p-6" style={{ borderColor: "#dde3ea" }}>
        <NotesSection clientAssignmentId={assignment.id} notes={notes} />
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
