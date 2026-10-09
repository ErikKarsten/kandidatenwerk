import { notFound, redirect } from "next/navigation"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getStaffContext } from "@/lib/auth-guards"
import { buildCv } from "@/lib/cv"
import { parseWerdegang } from "@/lib/cv-werdegang"
import { CvToolbar } from "./cv-toolbar"

export const metadata = { title: "Lebenslauf – Kandidatenwerk" }

// Lebenslauf zum Weitergeben an Kanzleien (Paket 24, T-97): druckfertig (Browser-Dialog
// "Als PDF sichern"), vollständig oder anonymisiert (?variante=anonym). Nur für das Team;
// bewusst außerhalb von /dashboard, damit keine Seitenleiste mitgedruckt wird.
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
  if ("error" in ctx) redirect("/login")

  const [{ data: candidate }, { data: definitions }, { data: settings }, { data: agency }, { data: me }] = await Promise.all([
    supabase.from("candidates").select("id, first_name, last_name, email, phone, plz, berufsbild, custom_fields, cv_werdegang").eq("id", id).maybeSingle(),
    supabase.from("custom_field_definitions").select("key, label, active").order("sort_order"),
    ctx.staff.agencyId ? supabase.from("agency_settings").select("logo_url").eq("agency_id", ctx.staff.agencyId).maybeSingle() : Promise.resolve({ data: null }),
    ctx.staff.agencyId ? supabase.from("agencies").select("name").eq("id", ctx.staff.agencyId).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("profiles").select("full_name, email, phone").eq("id", ctx.staff.userId).maybeSingle(),
  ])
  if (!candidate) notFound()

  // Werdegang (Paket 43): fehlt er, erzeugt die Werkzeugleiste ihn per KI und lädt neu.
  const werdegang = candidate.cv_werdegang ? parseWerdegang(candidate.cv_werdegang) : []
  const cv = buildCv({ ...candidate, custom_fields: (candidate.custom_fields ?? {}) as Record<string, unknown> }, definitions ?? [], anonym)
  const today = new Date().toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })
  const contact = [me?.full_name, me?.email, me?.phone].filter(Boolean).join(" · ")

  return (
    <div className="min-h-screen bg-[#f0f4f8] py-6 print:bg-white print:py-0">
      <style>{`@page { size: A4; margin: 14mm; } @media print { .cv-sheet { box-shadow: none !important; border: none !important; padding: 0 !important; } }`}</style>
      <CvToolbar candidateId={candidate.id} anonym={anonym} hasWerdegang={werdegang.length > 0} />
      <div className="cv-sheet mx-auto max-w-[210mm] rounded-xl border bg-white p-10 shadow-sm" style={{ borderColor: "#dde3ea" }}>
        <header className="flex items-start justify-between gap-6 border-b pb-6" style={{ borderColor: "#dde3ea" }}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Kandidatenprofil{anonym ? " · anonymisiert" : ""}</p>
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
