// Erwähnungen in Notizen im Verlauf eines Kandidaten (Paket 78): "@Kollege" und
// "#Aufgabe". Erwähnte Kollegen und die Zuständigen verknüpfter Aufgaben bekommen eine
// Mail mit dem Text und einem Link zum Kandidaten - so kann man sich zum Kandidaten
// austauschen. Fehler beim Versand blockieren das Speichern der Notiz nie.
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"
import { sendEmail } from "@/lib/brevo-mail"
import { emailButton, renderEmailLayout } from "@/lib/email-layout"
import { splitReferences } from "@/lib/comment-text"

const APP_BASE_URL = "https://kandidatenwerk.kanzleistelle24.de"

interface Person {
  id: string
  full_name: string | null
  email: string | null
}

interface TaskRef {
  id: string
  title: string
  assigned_to: string | null
}

// Wer wird warum benachrichtigt? Ohne den Verfasser selbst; wer erwähnt ist und zugleich
// eine verknüpfte Aufgabe hat, bekommt eine Mail.
export function historyNoteRecipients(
  content: string,
  team: Person[],
  tasks: TaskRef[],
  authorId: string
): { person: Person; mentioned: boolean; tasks: string[] }[] {
  const parts = splitReferences(
    content,
    team.map((p) => p.full_name ?? ""),
    tasks.map((t) => t.title)
  )
  const mentionedNames = new Set(parts.filter((p) => p.type === "mention").map((p) => p.value))
  const taskTitles = new Set(parts.filter((p) => p.type === "task").map((p) => p.value))
  const byId = new Map<string, { person: Person; mentioned: boolean; tasks: string[] }>()
  for (const p of team) {
    if (p.full_name && mentionedNames.has(p.full_name)) byId.set(p.id, { person: p, mentioned: true, tasks: [] })
  }
  for (const t of tasks) {
    if (!taskTitles.has(t.title) || !t.assigned_to) continue
    const person = team.find((p) => p.id === t.assigned_to)
    if (!person) continue
    const entry = byId.get(person.id) ?? { person, mentioned: false, tasks: [] }
    if (!entry.tasks.includes(t.title)) entry.tasks.push(t.title)
    byId.set(person.id, entry)
  }
  return [...byId.values()].filter((e) => e.person.id !== authorId && !!e.person.email)
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

export async function notifyHistoryNoteReferences(
  supabase: SupabaseClient<Database>,
  o: { candidateId: string; authorId: string; content: string }
): Promise<string[]> {
  try {
    const [{ data: team }, { data: tasks }, { data: candidate }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email").in("role", ["agency_admin", "agency_member"]),
      supabase.from("tasks").select("id, title, assigned_to").eq("candidate_id", o.candidateId),
      supabase.from("candidates").select("first_name, last_name").eq("id", o.candidateId).maybeSingle(),
    ])
    const recipients = historyNoteRecipients(o.content, team ?? [], tasks ?? [], o.authorId)
    if (recipients.length === 0) return []
    const author = (team ?? []).find((p) => p.id === o.authorId)?.full_name ?? "Jemand"
    const name = `${candidate?.first_name ?? ""} ${candidate?.last_name ?? ""}`.trim() || "einem Kandidaten"
    const link = `${APP_BASE_URL}/dashboard/candidates/${o.candidateId}`
    for (const r of recipients) {
      const reason = r.mentioned
        ? `${author} hat dich im Verlauf von ${name} erwähnt`
        : `${author} hat bei ${name} auf deine Aufgabe „${r.tasks[0]}“ Bezug genommen`
      await sendEmail(
        [r.person.email!],
        reason,
        renderEmailLayout({
          heading: escapeHtml(reason),
          contentHtml: `<div style="white-space:pre-wrap;border-left:3px solid #dde3ea;padding-left:12px;">${escapeHtml(o.content)}</div>${
            r.tasks.length ? `<p style="margin:12px 0 0;color:#6b7280;font-size:13px;">Verknüpfte Aufgabe: ${r.tasks.map(escapeHtml).join(", ")}</p>` : ""
          }${emailButton(link, "Zum Kandidaten")}`,
          footerNote: "Antworten kannst du direkt im Verlauf des Kandidaten.",
        })
      )
    }
    return recipients.map((r) => r.person.full_name ?? r.person.email!)
  } catch (err) {
    console.error(`[verlauf] Benachrichtigung fehlgeschlagen: ${err instanceof Error ? err.message : err}`)
    return []
  }
}
