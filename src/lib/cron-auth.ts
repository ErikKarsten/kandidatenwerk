// Absicherung der Cron-Routen: custom-worker.ts schickt CRON_SECRET im Header
// x-cron-secret. Zeitkonstanter Vergleich; ohne gesetztes Secret ist jede Anfrage abgelehnt.
import { timingSafeEqual } from "node:crypto"

export function isCronAuthorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET
  const provided = request.headers.get("x-cron-secret")
  if (!expected || !provided) return false
  const a = Buffer.from(expected)
  const b = Buffer.from(provided)
  return a.length === b.length && timingSafeEqual(a, b)
}
