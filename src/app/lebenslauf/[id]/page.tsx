import { notFound, redirect } from "next/navigation"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getStaffContext } from "@/lib/auth-guards"
import { buildCv } from "@/lib/cv"
import { parseWerdegang, werdegangInputHash } from "@/lib/cv-werdegang"
import { SAMPLE_TAG } from "@/lib/candidate-tags"
import { loadBerufsbilder } from "@/lib/berufsbilder-server"
import { CvToolbar } from "./cv-toolbar"
import { loadPortalCvContext, type PortalCvContext } from "@/lib/portal-cv"

export const metadata = { title: "Lebenslauf – Kandidatenwerk" }

// Lebenslauf zum Weitergeben an Kanzleien (Paket 24, T-97): druckfertig (Browser-Dialog
// "Als PDF sichern"), vollständig oder anonymisiert (?variante=anonym). Für das Team und
// seit Paket 87 auch für Kanzleien im Kundenportal (zugeordnete, vorqualifizierte
// Kandidaten, nur die Felder aus dem Portal). Bewusst außerhalb von /dashboard und
// /portal, damit keine Seitenleiste mitgedruckt wird.
export default async function LebenslaufPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ variante?: string }>
}) {
  const { id } = await params
  const anonym = (await searchParams).variante === "anonym"
  const supabase = await createSupabaseServerClient()
  const ctx = await getStaffContext(supabase)
  let portal: PortalCvContext | null = null
  if ("error" in ctx) {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) redirect("/login")
    portal = await loadPortalCvContext(supabase, id)
    if (!portal) notFound()
  }
  const staff = "error" in ctx ? null : ctx.staff
  // Im Portal immer der vollständige Lebenslauf (die Kanzlei sieht den Kandidaten ohnehin).
  const anonymView = anonym && !portal

  const [{ data: candidate }, { data: definitions }, { data: settings }, { data: agency }, { data: me }, berufsbilder] = await Promise.all([
    supabase.from("candidates").select("id, first_name, last_name, email, phone, plz, berufsbild, custom_fields, notes, tags, cv_werdegang, cv_werdegang_input").eq("id", id).maybeSingle(),
    staff ? supabase.from("custom_field_definitions").select("key, label, active").order("sort_order") : Promise.resolve({ data: portal!.definitions }),
    staff?.agencyId ? supabase.from("agency_settings").select("logo_url").eq("agency_id", staff.agencyId).maybeSingle() : Promise.resolve({ data: portal ? { logo_url: portal.logoUrl } : null }),
    staff?.agencyId ? supabase.from("agencies").select("name").eq("id", staff.agencyId).maybeSingle() : Promise.resolve({ data: portal?.agencyName ? { name: portal.agencyName } : null }),
    staff ? supabase.from("profiles").select("full_name, email, phone").eq("id", staff.userId).maybeSingle() : Promise.resolve({ data: null }),
    loadBerufsbilder(),
  ])
  if (!candidate) notFound()

  // Werdegang (Paket 43): fehlt er, erzeugt die Werkzeugleiste ihn per KI und lädt neu -
  // ebenso, wenn sich die Angaben seitdem geändert haben (Paket 82). Musterdatensätze
  // behalten ihren beim Erzeugen geschriebenen Werdegang.
  const werdegang = candidate.cv_werdegang ? parseWerdegang(candidate.cv_werdegang, anonymView) : []
  const isSample = (candidate.tags ?? []).includes(SAMPLE_TAG)
  const outdated =
    werdegang.length > 0 &&
    !isSample &&
    candidate.cv_werdegang_input !== werdegangInputHash({ ...candidate, custom_fields: (candidate.custom_fields ?? {}) as Record<string, unknown> })
  const cv = buildCv(
    { ...candidate, custom_fields: (candidate.custom_fields ?? {}) as Record<string, unknown> },
    definitions ?? [],
    anonymView,
    berufsbilder,
    portal?.allowedKeys ?? null
  )
  const today = new Date().toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })
  // Ansprechpartner: wer den Lebenslauf öffnet, im Portal der Key Account Manager der Kanzlei.
  const contact = portal ? portal.contact : [me?.full_name, me?.email, me?.phone].filter(Boolean).join(" · ")

  return (
    <div className="min-h-screen bg-[#f0f4f8] py-6 print:bg-white print:py-0">
      <style>{`@page { size: A4; margin: 14mm; } @media print { .cv-sheet { box-shadow: none !important; border: none !important; padding: 0 !important; } }`}</style>
      <CvToolbar candidateId={candidate.id} anonym={anonymView} hasWerdegang={werdegang.length > 0} outdated={outdated} portal={!!portal} />
      <div className="cv-sheet mx-auto max-w-[210mm] rounded-xl border bg-white p-10 shadow-sm" style={{ borderColor: "#dde3ea" }}>
        <header className="flex items-start justify-between gap-6 border-b pb-6" style={{ borderColor: "#dde3ea" }}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Kandidatenprofil{anonymView ? " · anonymisiert" : ""}</p>
            <h1 className="mt-1 text-3xl font-bold text-gray-900">{cv.title}</h1>
            <p className="mt-1 text-lg" style={{ color: "#1e56a0" }}>{cv.subtitle}</p>
          </div>
          {settings?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={settings.logo_url} alt="Logo" className="max-h-16 max-w-[180px] object-contain" />
          ) : (
            <span className="text-lg font-bold" style={{ color: "#1e56a0" }}>{agency?.name ?? "Kandidatenwerk"}</span>
          )}
        </header>

        {cv.facts.length > 0 && (
          <dl className="grid grid-cols-2 gap-x-8 gap-y-3 border-b py-6 sm:grid-cols-4" style={{ borderColor: "#dde3ea" }}>
            {cv.facts.map((f) => (
              <div key={f.label}>
                <dt className="text-xs uppercase tracking-wide text-gray-400">{f.label}</dt>
                <dd className="mt-0.5 text-sm font-medium text-gray-900">{f.value}</dd>
              </div>
            ))}
          </dl>
        )}

        <div className="flex flex-col gap-6 py-6">
          {werdegang.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide" style={{ color: "#1e56a0" }}>
                Beruflicher Werdegang
              </h2>
              <div className="flex flex-col gap-4">
                {werdegang.map((st, i) => (
                  <div key={i} className="break-inside-avoid">
                    {st.heading && <p className="text-sm font-semibold text-gray-900">{st.heading}</p>}
                    {st.tasks.length > 0 && (
                      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-gray-800">
                        {st.tasks.map((t, j) => (
                          <li key={j}>{t}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
          {cv.sections.length === 0 && werdegang.length === 0 && <p className="text-sm text-gray-400">Zu diesem Kandidaten sind noch keine Angaben für den Lebenslauf hinterlegt.</p>}
          {cv.sections.map((s) => (
            <section key={s.title} className="break-inside-avoid">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide" style={{ color: "#1e56a0" }}>
                {s.title}
              </h2>
              <dl className="flex flex-col gap-2">
                {s.items.map((i) => (
                  <div key={i.label} className="grid grid-cols-[13rem_1fr] gap-4">
                    <dt className="text-sm text-gray-500">{i.label}</dt>
                    <dd className="whitespace-pre-wrap text-sm text-gray-900">{i.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>

        <footer className="border-t pt-4 text-xs text-gray-500" style={{ borderColor: "#dde3ea" }}>
          Vorgestellt von {agency?.name ?? "Endlich Mitarbeiter"}
          {contact ? ` · Ihr Ansprechpartner: ${contact}` : ""} · Stand {today}
        </footer>
      </div>
    </div>
  )
}
