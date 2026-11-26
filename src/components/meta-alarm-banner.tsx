// Rote Leisten über jeder Dashboard-Seite (Paket 108, übernommen aus dem Meta-Analyse-Tool):
// - solange Meta die Anzeigen nicht ausspielt (Stand aus meta_konto_status, den der
//   zentrale Meta-Abruf alle 30 Minuten schreibt),
// - solange Leads über Formulare ohne Kampagne hängen bleiben (Paket 116, lead-zuordnung.ts).
// Hier keine Meta-Anfrage. Beide lassen sich wegklicken (Paket 116).
import type { SupabaseClient } from "@supabase/supabase-js"
import { createSupabaseAdminClient } from "@/lib/supabase-admin"
import { uhrIn, type KontoStand } from "@/lib/meta-konto-logik"
import { OFFENE_FORMULARE_SCHLUESSEL, type OffeneFormulareStand } from "@/lib/lead-zuordnung"
import { WegklickbareLeiste } from "@/components/wegklickbare-leiste"

const datum = (iso: string) => new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", timeZone: "Europe/Berlin" })

export async function MetaAlarmBanner() {
  const db = createSupabaseAdminClient() as unknown as SupabaseClient
  const [{ data: konto }, { data: formulare }] = await Promise.all([
    db.from("meta_konto_status").select("stand").like("konto_id", "act_%").order("geprueft_am", { ascending: false }).limit(1).maybeSingle(),
    db.from("meta_konto_status").select("stand").eq("konto_id", OFFENE_FORMULARE_SCHLUESSEL).maybeSingle(),
  ])
  const stand = konto?.stand as KontoStand | undefined
  const offen = (formulare?.stand as OffeneFormulareStand | undefined)?.formulare ?? []

  return (
    <>
      {stand?.alarm && (
        <WegklickbareLeiste schluessel={`konto:${stand.alarm}:${stand.alarm_text ?? ""}`}>
          <p className="font-semibold">🔴 {stand.alarm_titel ?? "Kampagnen offline"}</p>
          <p className="mt-0.5">{stand.alarm_text}</p>
          <p className="mt-1 text-xs" style={{ color: "#b91c1c" }}>
            Geprüft um {uhrIn(stand.geprueft_am, stand.zeitzone)} Uhr ·{" "}
            <a href={`https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${stand.konto_id.replace(/^act_/, "")}`} target="_blank" rel="noopener noreferrer" className="underline">
              Im Werbeanzeigenmanager beheben
            </a>{" "}
            · <a href="/meta-analyse-tool/index.html" className="underline">Im Meta-Analyse-Tool ansehen</a>
          </p>
        </WegklickbareLeiste>
      )}
      {offen.length > 0 && (
        <WegklickbareLeiste schluessel={`formulare:${offen.map((f) => `${f.formId}@${f.letzterLead}`).join(",")}`}>
          <p className="font-semibold">
            🔴 Leads kommen nicht an: {offen.length === 1 ? "1 Formular" : `${offen.length} Formulare`} ohne Kampagne
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {offen.map((f) => (
              <li key={f.formId}>
                „{f.formName}“ (Seite {f.pageName}): {f.leads === 1 ? "1 Lead" : `${f.leads} Leads`}, zuletzt am {datum(f.letzterLead)}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs" style={{ color: "#b91c1c" }}>
            In der passenden Kampagne unter Einstellungen → „Formular verknüpfen“ auswählen - die Leads werden dann automatisch nachgeholt.
          </p>
        </WegklickbareLeiste>
      )}
    </>
  )
}
