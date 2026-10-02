// Macht aus freien Wohnort-Antworten ("41 Jahre & Dresden-Pieschen", "32 Jahre & wohnt
// in der Nähe von Stade", "Hechthausen (24 km von Stade entfernt)") eine Suchanfrage für
// die Ortssuche. Liefert null, wenn kein Ortsname übrig bleibt.
export function placeQueryFromAnswer(answer: string): string | null {
  const text = answer
    .replace(/\([^)]*\)/g, " ") // Klammerzusätze
    .replace(/[-–]\s*\d+\s*km\b.*$/i, " ") // "Dormagen - 25 km"
    .replace(/\b\d{1,3}\s*(jahre?|j\.)?\s*(alt)?\b/gi, " ") // Alter
    .replace(/\b(ich\s+)?(wohne?|wohnt|wohnhaft|lebe|aus|in|im|der|die|dem|nähe|naehe|von|bei|raum|umgebung|umkreis|ca\.?|und|alt)\b/gi, " ")
    .replace(/[&+/|;]/g, ",")
    .split(",")
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter((part) => /[a-zäöüß]{3,}/i.test(part))
  return text.length > 0 ? text.join(", ") : null
}
