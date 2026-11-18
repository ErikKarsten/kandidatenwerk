// Meta-Analyse-Tool (Paket 108): die Webseite des Tools (ErikKarsten/kampagnen-dashboard)
// 1:1 unter public/meta-analyse-tool/, hier eingebettet. Daten kommen über
// /api/meta-analyse/* aus Kandidatenwerk; angemeldet ist, wer diese Seite sieht.
export default function MetaAnalysePage() {
  return <iframe src="/meta-analyse-tool/index.html" title="Meta-Analyse-Tool" className="block h-full w-full border-0" />
}
