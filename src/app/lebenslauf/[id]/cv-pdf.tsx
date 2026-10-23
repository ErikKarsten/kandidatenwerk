"use client"

// PDF des Lebenslaufs direkt im Browser erzeugt (Paket 88): "Als PDF speichern" über den
// Druckdialog lieferte je nach Browser/System leere weiße Seiten. @react-pdf/renderer baut
// eine echte PDF mit Text (durchsuchbar, kopierbar), unabhängig von der Druckfunktion.
// Wird erst beim Klick geladen (dynamic import in der Werkzeugleiste).
import { Document, Image, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer"

export interface CvPdfData {
  fileName: string
  label: string
  title: string
  subtitle: string
  logoUrl: string | null
  agencyName: string
  facts: { label: string; value: string }[]
  werdegang: { heading: string; tasks: string[] }[]
  sections: { title: string; items: { label: string; value: string }[] }[]
  footer: string
}

const BLUE = "#1e56a0"

const s = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 48, paddingHorizontal: 42, fontFamily: "Helvetica", fontSize: 10, color: "#111827" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", borderBottomWidth: 1, borderBottomColor: "#dde3ea", paddingBottom: 16 },
  label: { fontSize: 8, color: "#9ca3af", letterSpacing: 1, textTransform: "uppercase", fontFamily: "Helvetica-Bold" },
  title: { fontSize: 22, fontFamily: "Helvetica-Bold", marginTop: 4 },
  subtitle: { fontSize: 13, color: BLUE, marginTop: 4 },
  logo: { maxHeight: 44, maxWidth: 140, objectFit: "contain" },
  agency: { fontSize: 13, fontFamily: "Helvetica-Bold", color: BLUE },
  facts: { flexDirection: "row", flexWrap: "wrap", borderBottomWidth: 1, borderBottomColor: "#dde3ea", paddingVertical: 14 },
  fact: { width: "25%", paddingRight: 8, marginBottom: 4 },
  factLabel: { fontSize: 7.5, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.5 },
  factValue: { fontSize: 10, fontFamily: "Helvetica-Bold", marginTop: 2 },
  section: { marginTop: 16 },
  sectionTitle: { fontSize: 9.5, fontFamily: "Helvetica-Bold", color: BLUE, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 },
  station: { marginBottom: 10 },
  stationHeading: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  task: { flexDirection: "row", marginTop: 2, paddingLeft: 4 },
  bullet: { width: 10 },
  taskText: { flex: 1, color: "#1f2937" },
  row: { flexDirection: "row", marginBottom: 5 },
  rowLabel: { width: 150, color: "#6b7280" },
  rowValue: { flex: 1 },
  footer: { position: "absolute", left: 42, right: 42, bottom: 24, borderTopWidth: 1, borderTopColor: "#dde3ea", paddingTop: 6, fontSize: 8, color: "#6b7280" },
})

export function CvDocument({ d, withLogo }: { d: CvPdfData; withLogo: boolean }) {
  return (
    <Document title={d.title} author={d.agencyName}>
      <Page size="A4" style={s.page} wrap>
        <View style={s.header}>
          <View style={{ flex: 1, paddingRight: 16 }}>
            <Text style={s.label}>{d.label}</Text>
            <Text style={s.title}>{d.title}</Text>
            <Text style={s.subtitle}>{d.subtitle}</Text>
          </View>
          {withLogo && d.logoUrl ? (
            // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf-Image hat kein alt
            <Image src={d.logoUrl} style={s.logo} />
          ) : (
            <Text style={s.agency}>{d.agencyName}</Text>
          )}
        </View>

        {d.facts.length > 0 && (
          <View style={s.facts}>
            {d.facts.map((f) => (
              <View key={f.label} style={s.fact}>
                <Text style={s.factLabel}>{f.label}</Text>
                <Text style={s.factValue}>{f.value}</Text>
              </View>
            ))}
          </View>
        )}

        {d.werdegang.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Beruflicher Werdegang</Text>
            {d.werdegang.map((st, i) => (
              <View key={i} style={s.station} wrap={false}>
                {st.heading ? <Text style={s.stationHeading}>{st.heading}</Text> : null}
                {st.tasks.map((t, j) => (
                  <View key={j} style={s.task}>
                    <Text style={s.bullet}>•</Text>
                    <Text style={s.taskText}>{t}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}

        {d.sections.map((sec) => (
          <View key={sec.title} style={s.section} wrap={false}>
            <Text style={s.sectionTitle}>{sec.title}</Text>
            {sec.items.map((item) => (
              <View key={item.label} style={s.row}>
                <Text style={s.rowLabel}>{item.label}</Text>
                <Text style={s.rowValue}>{item.value}</Text>
              </View>
            ))}
          </View>
        ))}

        <Text style={s.footer} fixed render={({ pageNumber, totalPages }) => `${d.footer}${totalPages > 1 ? ` · Seite ${pageNumber} von ${totalPages}` : ""}`} />
      </Page>
    </Document>
  )
}

// Logo per fetch vorab prüfen: lässt es sich nicht laden (z. B. CORS), entsteht die PDF ohne
// Logo statt gar nicht.
async function logoLoads(url: string | null): Promise<boolean> {
  if (!url) return false
  try {
    const res = await fetch(url, { mode: "cors" })
    return res.ok
  } catch {
    return false
  }
}

export async function downloadCvPdf(d: CvPdfData): Promise<void> {
  const withLogo = await logoLoads(d.logoUrl)
  const blob = await pdf(<CvDocument d={d} withLogo={withLogo} />).toBlob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = d.fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
