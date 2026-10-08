import { closeList, type CloseActivity } from "../../src/lib/close-api"
import { activityTypeOf, customActivityText } from "../../src/lib/close-sync"
import type { ProfileSource } from "../../src/lib/close-onboarding"

// Close: Notizen, Formulare und Besprechungs-Zusammenfassungen eines Leads (ohne Telefonate,
// deren Transkription wäre für den Massenimport zu langsam).
export async function closeActivitySources(leadId: string, labels: { types: Map<string, string>; fields: Map<string, string> }): Promise<ProfileSource[]> {
  const activities = await closeList<CloseActivity>(`/activity/?lead_id=${encodeURIComponent(leadId)}`, 1000).catch(() => [] as CloseActivity[])
  const out: ProfileSource[] = []
  for (const a of activities) {
    const type = activityTypeOf(a)
    const at = a.activity_at ?? a.date_created ?? null
    if (type === "meeting" && a.summary?.text) out.push({ label: `Close: Besprechung – ${a.title ?? ""}`, at, text: a.summary.text })
    else if (type === "note" && a.note?.trim()) out.push({ label: "Close: Notiz", at, text: a.note })
    else if (type === "custom") {
      const text = customActivityText(a, labels.fields)
      if (text) out.push({ label: `Close: Formular ${labels.types.get(a.custom_activity_type_id ?? "") ?? ""}`, at, text })
    }
  }
  return out
}
