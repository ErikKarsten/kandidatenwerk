// Tatsächliche Werte aus candidates.source (siehe candidates_source_check-Constraint
// bzw. Live-Daten-Check). "meta_ads" ist zwar als Constraint-Wert erlaubt, kommt aktuell
// aber in keinem Datensatz vor - taucht er künftig auf, hier ergänzen.
//
// Eigene Datei statt Export aus candidates-list.tsx: Letzteres ist "use client" - ein
// Server Component (candidates/page.tsx) kann von dort keine Konstante importieren, das
// bricht beim Build (RSC-Modulgrenze, siehe Next.js-App-Router-Dokumentation zu "use
// client"-Boundaries). Gleiches Muster wie candidate-status.ts/berufsbild.ts.
export const SOURCE_OPTIONS: { value: string; label: string }[] = [
  { value: "leadtable", label: "Leadtable" },
  { value: "kanzleistelle24", label: "Kanzleistelle24" },
  { value: "manual", label: "Manuell" },
]
