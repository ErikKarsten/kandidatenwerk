"use client"

// Darstellung des Meta-Analyse-Tools (Paket 108), Aufbau wie die Kampagnenanalyse-Seite
// des eigenständigen Tools: Kennzahlen, Das Wichtigste, Läuft gut/schlecht, Detail je
// Anzeige, Kosten pro Lead je Motiv, Noah gegen Neele, alle Anzeigen, Kampagnen, Erklärung.
import { useEffect, useMemo, useRef, useState } from "react"
import {
  ANZAHL_TOP_FLOP,
  MIN_AUSGABE_FLOP,
  MIN_AUSGABE_GALERIE,
  MIN_LEADS_TOP,
  besterUndTeuersterTyp,
  kampagnen,
  kurzname,
  laeuftGut,
  laeuftSchlecht,
  nachTyp,
  noahGegenNeele,
  summe,
  trichter,
  unterzeile,
  urteilGegenSchnitt,
  type AnzeigeAuswertung,
  type Stufe,
  type Trichter,
  type Urteil,
} from "@/lib/meta-analyse"

const BORDER = "#dde3ea"
const GOOD = "#1a9a6a"
const BAD = "#dc2626"
const BRAND = "#1e56a0"

const eur0 = (v: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v)
const eur2 = (v: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)
const int = (v: number) => new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(v)
const dec = (v: number, d: number) => new Intl.NumberFormat("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d }).format(v)
const pct = (v: number | null) => (v == null || !Number.isFinite(v) ? "–" : `${dec(v, 2)} %`)

const SYMBOL: Record<Urteil, string> = { stark: "✓", mittel: "–", schwach: "✗", unklar: "?" }

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border bg-white p-5 ${className}`} style={{ borderColor: BORDER }}>
      {children}
    </section>
  )
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-base font-semibold text-gray-900">{children}</h2>
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 mb-3 max-w-prose text-xs text-gray-500">{children}</p>
}

function Chip({ label, urteil }: { label: string; urteil: Urteil | null }) {
  const u = urteil ?? "unklar"
  const color = u === "stark" ? GOOD : u === "schwach" ? BAD : "#6b7280"
  return (
    <span className="rounded-full border px-1.5 py-px text-[11px] font-medium" style={{ color, borderColor: `${color}55` }} aria-label={`${label}: ${u}`}>
      {SYMBOL[u]} {label}
    </span>
  )
}

function AdCard({
  r,
  schnitt,
  t,
  selected,
  onSelect,
}: {
  r: AnzeigeAuswertung
  schnitt: number | null
  t: Trichter | undefined
  selected: boolean
  onSelect: () => void
}) {
  const u = urteilGegenSchnitt(r, schnitt)
  const gut = u === "good" && r.cpl != null
  const problem = t && !/^Kein/.test(t.engpass)
  const staerke = t?.bewerbung === "gut" ? "Viele Bewerbungen pro Klick" : t?.klick === "gut" ? "Wird oft geklickt" : "Läuft rund"
  const e = r.einschaetzung
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className="flex flex-col overflow-hidden rounded-lg border bg-white text-left transition hover:shadow-sm"
      style={{ borderColor: selected ? BRAND : BORDER, outline: selected ? `2px solid ${BRAND}` : undefined }}
    >
      <span className="block aspect-square w-full overflow-hidden" style={{ backgroundColor: "#f3f4f6" }}>
        {r.bildUrl && (
          // Signierte Links aus dem privaten Speicher - kein next/image (eigene Domain, kurzlebig).
          // eslint-disable-next-line @next/next/no-img-element
          <img src={r.bildUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
        )}
      </span>
      <span className="flex flex-col gap-0.5 p-3">
        <span className="line-clamp-2 text-sm font-semibold text-gray-900">{kurzname(r)}</span>
        <span className="text-xs text-gray-500">{unterzeile(r)}</span>
        <span className="mt-2 flex flex-wrap items-baseline gap-1.5">
          <span className="text-lg font-semibold tabular-nums text-gray-900">{r.cpl != null ? eur0(r.cpl) : "kein Lead"}</span>
          {r.cpl != null && <small className="text-xs text-gray-500">pro Lead</small>}
          {u && r.cpl != null && (
            <span className="rounded-full border px-2 text-[11px] font-medium" style={{ color: u === "good" ? GOOD : BAD, borderColor: u === "good" ? GOOD : BAD }}>
              {u === "good" ? "günstig" : "teuer"}
            </span>
          )}
        </span>
        <span className="text-xs tabular-nums text-gray-500">
          <b className="font-medium text-gray-900">{int(r.leads)}</b> {r.leads === 1 ? "Lead" : "Leads"} für <b className="font-medium text-gray-900">{eur0(r.ausgaben)}</b>
        </span>
        {t && (
          <span className="mt-1 text-xs font-medium" style={{ color: gut ? GOOD : problem ? BAD : "#6b7280" }}>
            {gut ? staerke : problem ? `Hakt: ${t.engpass}` : t.engpass}
          </span>
        )}
        {e && (
          <>
            <span className="mt-1.5 flex flex-wrap gap-1">
              <Chip label="Bild" urteil={e.bild_urteil} />
              <Chip label="Text" urteil={e.text_urteil} />
              <Chip label="Benefits" urteil={e.benefits_urteil} />
            </span>
            {e.fazit && <span className="mt-1 text-xs text-gray-600">{e.fazit}</span>}
          </>
        )}
      </span>
    </button>
  )
}

const WORT: Record<"auslieferung" | "klick" | "bewerbung", Record<Stufe, string>> = {
  auslieferung: { gut: "günstig", normal: "normal", schwach: "teuer", unklar: "unklar" },
  klick: { gut: "oft", normal: "normal", schwach: "selten", unklar: "unklar" },
  bewerbung: { gut: "oft", normal: "normal", schwach: "selten", unklar: "zu wenig Klicks" },
}

function Zahl({ label, value, small = false }: { label: string; value: string; small?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className={small ? "text-sm font-medium tabular-nums text-gray-900" : "text-lg font-semibold tabular-nums text-gray-900"}>{value}</dd>
    </div>
  )
}

function Detail({ r, t, onClose }: { r: AnzeigeAuswertung; t: Trichter | undefined; onClose: () => void }) {
  const e = r.einschaetzung
  const stufe = (titel: string, key: "auslieferung" | "klick" | "bewerbung", wert: string, schnitt: string) => {
    const u = t?.[key] ?? "unklar"
    const color = u === "gut" ? GOOD : u === "schwach" ? BAD : "#374151"
    return (
      <div className="rounded-lg border p-3" style={{ borderColor: u === "gut" ? `${GOOD}66` : u === "schwach" ? `${BAD}66` : BORDER }}>
        <dt className="text-xs text-gray-500">{titel}</dt>
        <dd>
          <div className="text-sm font-semibold" style={{ color }}>
            {WORT[key][u]}
          </div>
          <div className="text-xs tabular-nums text-gray-500">
            {wert}, Schnitt {schnitt}
          </div>
        </dd>
      </div>
    )
  }
  return (
    <Card className="scroll-mt-4">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-[minmax(200px,300px)_1fr]">
        <div>
          {r.bildUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={r.bildUrl} alt={`Motiv der Anzeige ${kurzname(r)}`} className="w-full rounded-lg border" style={{ borderColor: BORDER }} />
          )}
          {r.format === "Video" && <p className="mt-1 text-xs text-gray-500">Vorschaubild des Videos</p>}
        </div>
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-base font-semibold text-gray-900">{kurzname(r)}</p>
              <p className="text-xs text-gray-500">
                {unterzeile(r)}, {r.status}
              </p>
            </div>
            <button type="button" onClick={onClose} className="rounded-md border px-3 py-1 text-xs text-gray-700 hover:bg-gray-50" style={{ borderColor: BORDER }}>
              Schließen
            </button>
          </div>
          <dl className="my-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Zahl label="Kosten pro Lead" value={r.cpl != null ? eur0(r.cpl) : "kein Lead"} />
            <Zahl label="Leads" value={int(r.leads)} />
            <Zahl label="Ausgegeben" value={eur0(r.ausgaben)} />
            <Zahl label="Klickrate" value={pct(r.ctr)} />
          </dl>

          {(t || e) && (
            <div className="mt-2">
              <h3 className="text-sm font-semibold text-gray-900">Warum läuft die Anzeige so?</h3>
              {t && (
                <>
                  <p className="mt-1 text-xs text-gray-500">Laut Zahlen, im Vergleich zum Schnitt aller Anzeigen:</p>
                  <dl className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {stufe("1. Ausgespielt (CPM)", "auslieferung", r.cpm == null ? "–" : eur2(r.cpm), t.median_cpm == null ? "–" : eur2(t.median_cpm))}
                    {stufe("2. Geklickt", "klick", pct(r.ctr), pct(t.median_ctr))}
                    {stufe(
                      "3. Beworben pro 100 Klicks",
                      "bewerbung",
                      r.leads_pro_100_klicks == null ? "–" : dec(r.leads_pro_100_klicks, 1),
                      t.median_leads_pro_100_klicks == null ? "–" : dec(t.median_leads_pro_100_klicks, 1)
                    )}
                  </dl>
                </>
              )}
              {e && (
                <>
                  <p className="mt-3 text-xs text-gray-500">Einschätzung der KI zu Bild, Text und Benefits:</p>
                  <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
                    <dt><Chip label="Bild" urteil={e.bild_urteil} /></dt>
                    <dd className="text-gray-700">{e.bild}</dd>
                    <dt><Chip label="Text" urteil={e.text_urteil} /></dt>
                    <dd className="text-gray-700">{e.text}</dd>
                    <dt><Chip label="Benefits" urteil={e.benefits_urteil} /></dt>
                    <dd className="text-gray-700">{e.benefits}</dd>
                  </dl>
                  {e.fazit && <p className="mt-2 text-sm text-gray-900">{e.fazit}</p>}
                </>
              )}
            </div>
          )}

          <h3 className="mt-4 text-sm font-semibold text-gray-900">{r.ueberschriften.length === 1 ? "Überschrift" : `${r.ueberschriften.length} Überschriften`}</h3>
          {r.ueberschriften.map((u, i) => (
            <p key={i} className="mt-1 border-l-2 pl-3 text-sm whitespace-pre-line text-gray-700" style={{ borderColor: BORDER }}>
              {u}
            </p>
          ))}
          <h3 className="mt-4 text-sm font-semibold text-gray-900">{r.texte.length === 1 ? "Anzeigentext" : `${r.texte.length} Anzeigentexte`}</h3>
          {r.texte.map((u, i) => (
            <p key={i} className="mt-1 max-w-prose border-l-2 pl-3 text-sm whitespace-pre-line text-gray-700" style={{ borderColor: BORDER }}>
              {u}
            </p>
          ))}
          {(r.ueberschriften.length > 1 || r.texte.length > 1) && (
            <p className="mt-1 text-xs text-gray-500">Meta mischt diese Varianten selbst. Welche davon besser lief, zeigt Meta nicht.</p>
          )}
          {r.ueberschriften.length === 0 && r.texte.length === 0 && <p className="mt-1 text-xs text-gray-500">Texte werden einmal täglich von Meta geholt.</p>}

          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-semibold text-gray-900">Weitere Zahlen und Einstellungen</summary>
            <dl className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Zahl small label="Leads pro 100 Klicks" value={r.leads_pro_100_klicks == null ? "–" : dec(r.leads_pro_100_klicks, 1)} />
              <Zahl small label="Link-Klicks" value={int(r.klicks)} />
              <Zahl small label="Impressionen" value={int(r.impressionen)} />
              <Zahl small label="CPM" value={r.cpm == null ? "–" : eur2(r.cpm)} />
              {r.format === "Video" && <Zahl small label="3-Sek-Videoaufrufe" value={int(r.videoaufrufe_3s)} />}
              {r.format === "Video" && <Zahl small label="ThruPlays" value={int(r.thruplays)} />}
            </dl>
            <p className="mt-2 text-xs text-gray-500">Anzeigenname: {r.anzeige}</p>
            <p className="text-xs text-gray-500">Kampagne: {r.kampagne}</p>
            <p className="text-xs text-gray-500">Zielgruppe: {r.zielgruppe || "–"}</p>
            <p className="text-xs text-gray-500">Budget: {r.budget || "–"}</p>
          </details>
        </div>
      </div>
    </Card>
  )
}

export function AnalyseView({
  anzeigen,
  qualifiziert,
  qualifiziertAusgaben,
}: {
  anzeigen: AnzeigeAuswertung[]
  qualifiziert: number
  qualifiziertAusgaben: number
}) {
  const [auswahl, setAuswahl] = useState<string | null>(null)
  const [motiv, setMotiv] = useState("")
  const detailRef = useRef<HTMLDivElement>(null)

  const s = useMemo(() => summe(anzeigen), [anzeigen])
  const typen = useMemo(() => nachTyp(anzeigen), [anzeigen])
  const tr = useMemo(() => trichter(anzeigen), [anzeigen])
  const nn = useMemo(() => noahGegenNeele(anzeigen), [anzeigen])
  const kamp = useMemo(() => kampagnen(anzeigen), [anzeigen])
  const gut = useMemo(() => laeuftGut(anzeigen), [anzeigen])
  const schlecht = useMemo(() => laeuftSchlecht(anzeigen), [anzeigen])
  const { bester, teuerster } = useMemo(() => besterUndTeuersterTyp(typen), [typen])
  const chartTypen = typen.filter((t) => t.typ !== "Eigene Stelle" && t.cpl != null)
  const galerie = anzeigen
    .filter((r) => (!motiv || r.typ === motiv) && r.ausgaben >= MIN_AUSGABE_GALERIE)
    .sort((x, y) => (x.cpl ?? Infinity) - (y.cpl ?? Infinity) || y.ausgaben - x.ausgaben)
  const motivOptionen = [...new Set(anzeigen.map((r) => r.typ))].sort((a, b) => a.localeCompare(b, "de"))
  const gewaehlt = anzeigen.find((r) => r.id === auswahl) ?? null
  const typCpl = (typ: string) => typen.find((t) => t.typ === typ)?.cpl ?? null

  function oeffne(id: string) {
    setAuswahl(auswahl === id ? null : id)
  }
  // Nach dem Öffnen zur Detailansicht scrollen.
  useEffect(() => {
    if (auswahl) detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [auswahl])

  if (anzeigen.length === 0) {
    return (
      <Card>
        <p className="text-sm text-gray-600">Für diesen Zeitraum sind keine Werbezahlen gespeichert.</p>
      </Card>
    )
  }

  const karten = (rows: AnzeigeAuswertung[]) => (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(170px,100%),1fr))] gap-3">
      {rows.map((r) => (
        <AdCard key={r.id} r={r} schnitt={s.cpl} t={tr.get(r.id)} selected={auswahl === r.id} onSelect={() => oeffne(r.id)} />
      ))}
    </div>
  )
  const maxCpl = Math.max(1, ...chartTypen.map((t) => t.cpl!))

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {[
          ["Ausgegeben", eur0(s.ausgaben)],
          ["Leads", int(s.leads)],
          ["Kosten pro Lead", s.cpl != null ? eur0(s.cpl) : "–"],
          ["Qualifizierte Leads", int(qualifiziert)],
          ["Kosten pro qualifiziertem Lead", qualifiziert > 0 ? eur0(qualifiziertAusgaben / qualifiziert) : "–"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border bg-white p-4" style={{ borderColor: BORDER }}>
            <p className="text-xs text-gray-500">{label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">{value}</p>
          </div>
        ))}
      </div>

      <Card>
        <H2>Das Wichtigste</H2>
        <ul className="mt-3 flex max-w-3xl flex-col gap-2 text-sm text-gray-700">
          <li className="border-l-[3px] pl-3" style={{ borderColor: BORDER }}>
            Am günstigsten waren Anzeigen vom Typ <b>{bester ? `„${bester.typ}“` : "—"}</b> mit <b>{bester ? eur0(bester.cpl!) : "—"}</b> pro Lead.
          </li>
          <li className="border-l-[3px] pl-3" style={{ borderColor: BORDER }}>
            Am teuersten waren Anzeigen vom Typ <b>{teuerster ? `„${teuerster.typ}“` : "—"}</b> mit <b>{teuerster ? eur0(teuerster.cpl!) : "—"}</b> pro Lead.
          </li>
          <li className="border-l-[3px] pl-3" style={{ borderColor: BORDER }}>
            {nn.regionen > 0 ? (
              <>
                Im direkten Vergleich der Regionsvideos war Noah in <b>{nn.noah}</b> und Neele in <b>{nn.neele}</b> von <b>{nn.regionen}</b> Regionen günstiger.
              </>
            ) : (
              "Für einen Vergleich Noah gegen Neele fehlen Regionen, in denen beide Videos mindestens 100 € ausgegeben haben."
            )}
          </li>
        </ul>
      </Card>

      <p className="max-w-3xl text-xs text-gray-500">
        Unter jeder Anzeige steht, wo es laut Zahlen hakt, und wie Bild, Text und Benefits wirken: ✓ stark, – mittel, ✗ schwach. Die Bewertung von Bild, Text und Benefits ist
        eine Einschätzung der KI, keine Messung.
      </p>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <H2>Läuft gut</H2>
          <Note>
            Die günstigsten Anzeigen mit mindestens {MIN_LEADS_TOP} Leads und {eur0(MIN_AUSGABE_FLOP)} Ausgaben. Klick für Texte und Details.
          </Note>
          {gut.length ? karten(gut) : <p className="text-sm text-gray-500">Noch keine Anzeige mit genug Leads im Zeitraum.</p>}
        </Card>
        <Card>
          <H2>Läuft schlecht</H2>
          <Note>Die {ANZAHL_TOP_FLOP} Anzeigen, bei denen ein Lead am meisten gekostet hat, ab {eur0(MIN_AUSGABE_FLOP)} Ausgaben. Klick für Texte und Details.</Note>
          {schlecht.length ? karten(schlecht) : <p className="text-sm text-gray-500">Noch keine Anzeige mit genug Ausgaben im Zeitraum.</p>}
        </Card>
      </div>

      <div ref={detailRef}>{gewaehlt && <Detail r={gewaehlt} t={tr.get(gewaehlt.id)} onClose={() => setAuswahl(null)} />}</div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <H2>Kosten pro Lead je Motiv</H2>
          <Note>Blasse Balken haben weniger als 10 Leads und sind noch unsicher. Die gestrichelte Linie ist der Schnitt.</Note>
          <div className="relative flex flex-col gap-1.5">
            {s.cpl != null && (
              <div
                className="pointer-events-none absolute top-0 bottom-0 border-l border-dashed"
                style={{ left: `calc(40% + ${(Math.min(s.cpl, maxCpl) / maxCpl) * 45}%)`, borderColor: "#9ca3af" }}
                title={`Schnitt ${eur0(s.cpl)}`}
              />
            )}
            {chartTypen.map((t) => (
              <div
                key={t.typ}
                className="flex items-center gap-2 text-xs"
                title={`${t.typ}: ${eur0(t.cpl!)} pro Lead · ${int(t.leads)} Leads für ${eur0(t.ausgaben)} · ${int(t.anzeigen)} Anzeigen, Klickrate ${pct(t.ctr)}`}
              >
                <span className="w-[40%] truncate text-right text-gray-800">{t.typ}</span>
                <span className="flex w-[60%] items-center gap-1.5">
                  <span className="h-4 rounded-sm" style={{ width: `${Math.max(1, (t.cpl! / maxCpl) * 75)}%`, backgroundColor: BRAND, opacity: t.leads < 10 ? 0.35 : 1 }} />
                  <span className="tabular-nums text-gray-600">{eur0(t.cpl!)}</span>
                </span>
              </div>
            ))}
            {s.cpl != null && <p className="mt-1 text-right text-xs text-gray-500">Schnitt {eur0(s.cpl)}</p>}
          </div>
        </Card>
        <Card>
          <H2>Noah gegen Neele</H2>
          <Note>Gleicher Anzeigentext, gleiche Regionen, nur das Video ist anders. Kosten pro Lead in den Regionskampagnen.</Note>
          <dl className="grid grid-cols-2 gap-3">
            {[
              ["Video Noah", typCpl("Video Noah regional")],
              ["Video Neele", typCpl("Video Neele regional")],
            ].map(([label, wert]) => (
              <div key={label as string} className="rounded-lg border p-4" style={{ borderColor: BORDER }}>
                <dt className="text-xs text-gray-500">{label}</dt>
                <dd className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">
                  {wert != null ? eur0(wert as number) : "—"} <small className="text-xs font-normal text-gray-500">pro Lead</small>
                </dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>

      <details className="rounded-xl border bg-white p-5" style={{ borderColor: BORDER }}>
        <summary className="cursor-pointer text-base font-semibold text-gray-900">Alle Anzeigen ansehen</summary>
        <label className="mt-3 inline-flex flex-col gap-1 text-xs text-gray-500">
          Motiv
          <select value={motiv} onChange={(e) => setMotiv(e.target.value)} className="rounded-md border bg-white px-2 py-1.5 text-sm text-gray-800" style={{ borderColor: BORDER }}>
            <option value="">Alle Motive</option>
            {motivOptionen.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <Note>Günstigste zuerst. Anzeigen unter {eur0(MIN_AUSGABE_GALERIE)} Ausgaben sind ausgeblendet.</Note>
        {galerie.length ? karten(galerie) : <p className="text-sm text-gray-500">Für dieses Motiv gibt es keine Anzeige mit genug Ausgaben.</p>}
      </details>

      <details className="rounded-xl border bg-white p-5" style={{ borderColor: BORDER }}>
        <summary className="cursor-pointer text-base font-semibold text-gray-900">Alle Kampagnen als Tabelle</summary>
        <div className="mt-3 max-h-[480px] overflow-auto rounded-lg border" style={{ borderColor: BORDER }}>
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b text-left text-xs text-gray-500" style={{ borderColor: BORDER }}>
                <th className="px-3 py-2 font-medium">Kampagne</th>
                <th className="px-3 py-2 text-right font-medium">Ausgaben</th>
                <th className="px-3 py-2 text-right font-medium">Leads</th>
                <th className="px-3 py-2 text-right font-medium">Kosten pro Lead</th>
              </tr>
            </thead>
            <tbody>
              {kamp.map((k) => (
                <tr key={k.kampagne} className="border-b last:border-0" style={{ borderColor: "#eef2f6" }}>
                  <td className="min-w-[200px] px-3 py-2 text-gray-800">{k.kampagne}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-700">{eur0(k.ausgaben)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-700">{int(k.leads)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-700">{k.cpl != null ? eur0(k.cpl) : "kein Lead"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <details className="rounded-xl border bg-white p-5" style={{ borderColor: BORDER }}>
        <summary className="cursor-pointer text-base font-semibold text-gray-900">So liest du die Zahlen</summary>
        <dl className="mt-3 max-w-3xl text-sm">
          {[
            ["Kosten pro Lead", "Ausgaben geteilt durch die Zahl der abgeschickten Formulare."],
            ["Qualifizierte Leads", "Kandidaten aus den Meta-Kampagnen in Kandidatenwerk, die vorqualifiziert sind oder schon einer Kanzlei zugeordnet wurden."],
            ["Günstig und teuer", "„Günstig“ heißt mindestens 20 % unter dem Schnitt, „teuer“ mindestens 50 % darüber."],
            ["Klickrate", "Wie viele von 100 Leuten, die die Anzeige sehen, auf den Link klicken."],
            [
              "Wo es hakt",
              "Aus den Zahlen: Jede Anzeige wird mit dem Median aller Anzeigen ab 50 € Ausgaben verglichen. „Wird kaum geklickt“ deutet auf Bild oder Überschrift, „Klicks, aber kaum Bewerbungen“ auf Text, Angebot oder Formular, „teuer ausgespielt“ darauf, dass Meta die Anzeige als wenig passend einstuft.",
            ],
            ["Bild, Text, Benefits", "Einschätzung der KI anhand von Motiv und Anzeigentext. Bei Videos ist nur das Vorschaubild sichtbar, der Inhalt wurde nicht bewertet."],
            [
              "Motiv",
              "Zugeordnet anhand von Anzeigenname (und beim Testlauf vom Bild). Eigene Stellen von Endlich Mitarbeiter zählen nicht in „Läuft gut“, „Läuft schlecht“ und „Das Wichtigste“, weil sie einen anderen Bewerbermarkt ansprechen.",
            ],
          ].map(([dt, dd]) => (
            <div key={dt} className="mt-2">
              <dt className="font-medium text-gray-900">{dt}</dt>
              <dd className="text-gray-600">{dd}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-sm text-gray-600">
          Die Zahlen holt Kandidatenwerk alle 30 Minuten von Meta, Texte, Bilder und Einschätzungen einmal am Tag. Wenige Leads können Zufall sein, und Leads sagen nichts
          darüber, wie gut die Bewerber sind.
        </p>
      </details>
    </div>
  )
}
