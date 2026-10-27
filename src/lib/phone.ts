// Telefonnummern vergleichbar machen (Paket 92): nur Ziffern, international ohne "+",
// deutsche Nummern mit 49 vorne - so meldet sipgate die Nummern in der Push-API
// (z. B. 4915111030580). Muss zur Spalte candidates.phone_normalized passen
// (Migration 20261027000001_paket92.sql).
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = raw.replace(/\(0\)/g, "").replace(/\D/g, "")
  if (!digits) return null
  if (digits.startsWith("00")) return digits.slice(2)
  if (digits.startsWith("0")) return `49${digits.slice(1)}`
  return digits
}
