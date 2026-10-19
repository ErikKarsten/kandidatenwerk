// Einmalige Mail an alle Kunden, die ihren Portal-Zugang noch nicht eingerichtet haben
// (Paket 68): Umstellung von Leadtable auf Kandidatenwerk, persönlicher Link zum
// Einrichten, Ansprechpartner Steffen Neubert. Je Zugang (Ansprechpartner mit E-Mail) eine
// Mail mit eigenem Link. Kunden ohne Zugang, aber mit Kontakt-E-Mail, bekommen vorher einen.
// Kunden im Projektstatus "Onboarding" bekommen keine Mail - das Portal wird mit ihnen im
// Onboarding gemeinsam durchgegangen (Wunsch 19.10.2026).
//
//   npx tsx scripts/portal-umstellung-mail.ts               Probelauf: Empfängerliste
//   npx tsx scripts/portal-umstellung-mail.ts --vorschau    Mail als HTML-Datei (neuimport/)
//   npx tsx scripts/portal-umstellung-mail.ts --ausfuehren  verschickt (fortsetzbar)
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import dotenv from "dotenv"
import { createClient } from "@supabase/supabase-js"
import type { Database } from "../src/types/database"
import { emailButton, renderEmailLayout } from "../src/lib/email-layout"
import { sendEmail } from "../src/lib/brevo-mail"
import { createPasswordLink } from "../src/lib/password-link"
import { ensurePortalAccess } from "../src/lib/portal-access"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), quiet: true })

const EXECUTE = process.argv.includes("--ausfuehren")
const PREVIEW = process.argv.includes("--vorschau")
const SENT_LOG = path.resolve(__dirname, "../neuimport/umstellung-gesendet.json")
const PREVIEW_FILE = path.resolve(__dirname, "../neuimport/umstellung-vorschau.html")
const LOGIN_URL = "https://kandidatenwerk.kanzleistelle24.de/login"

const CONTACT = { name: "Steffen Neubert", email: "s.neubert@endlich-mitarbeiter.de", phone: "+49 531 387 632 46" }
const SUBJECT = "Neu: Ihre Kandidat:innen ab sofort im Kandidatenwerk-Portal"

const db = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } })

function mailHtml(link: string, email: string): string {
  const li = (text: string) => `<li style="margin:4px 0;">${text}</li>`
  return renderEmailLayout({
    subtitle: "Kunden-Portal",
    heading: "Ihre Kandidat:innen finden Sie ab sofort hier",
    contentHtml: [
      `<p style="margin:0;">Guten Tag,</p>`,
      `<p style="margin:12px 0 0;">wir haben unser System umgestellt: Statt über Leadtable stellen wir Ihnen Ihre Kandidat:innen ab sofort in unserem eigenen Kunden-Portal <strong>Kandidatenwerk</strong> bereit.</p>`,
      `<p style="margin:12px 0 0;">Was das für Sie bedeutet:</p>`,
      `<ul style="margin:6px 0 0;padding-left:20px;">${[
        li("Alle Kandidat:innen, die wir für Sie gewinnen, finden Sie ab sofort in Ihrem Kunden-Portal – mit Profil und Unterlagen."),
        li("Dort geben Sie uns auch direkt Rückmeldung, z.&nbsp;B. wenn ein Vorstellungsgespräch vereinbart ist."),
        li("Wie bisher erhalten Sie eine E-Mail, sobald eine neue Kandidatin oder ein neuer Kandidat für Sie bereitsteht."),
        li("Alles andere bleibt, wie Sie es kennen."),
      ].join("")}</ul>`,
      `<p style="margin:16px 0 0;">Richten Sie Ihren Zugang einmalig über diesen Knopf ein – Sie legen dabei Ihr Passwort fest:</p>`,
      emailButton(link, "Zugang einrichten"),
      `<p style="margin:12px 0 0;font-size:12px;color:#9ca3af;text-align:center;">Danach melden Sie sich jederzeit unter <a href="${LOGIN_URL}" style="color:#1e56a0;">kandidatenwerk.kanzleistelle24.de</a> an. Falls der Knopf nicht funktioniert:<br><a href="${link}" style="color:#1e56a0;word-break:break-all;">${link}</a></p>`,
      `<p style="margin:20px 0 0;">Bei Fragen oder Problemen hilft Ihnen ${CONTACT.name} gerne weiter: <a href="mailto:${CONTACT.email}" style="color:#1e56a0;">${CONTACT.email}</a>, Tel. <a href="tel:${CONTACT.phone.replace(/\s/g, "")}" style="color:#1e56a0;">${CONTACT.phone}</a>. Weitere Fragen besprechen wir gerne auch in unserem nächsten Gespräch.</p>`,
      `<p style="margin:16px 0 0;">Viele Grüße<br>Ihr Team von Endlich Mitarbeiter</p>`,
    ].join(""),
    footerNote: `Diese E-Mail wurde an ${email} gesendet, weil Sie Kunde von Endlich Mitarbeiter sind.`,
    footerSender: "Gesendet von Endlich Mitarbeiter",
  })
}

interface Recipient {
  clientId: string
  clientName: string
  profileId: string | null
  email: string
}

async function loadRecipients(): Promise<{ recipients: Recipient[]; withoutEmail: string[]; onboarding: string[] }> {
  const { data: clients, error } = await db.from("clients").select("id, name, active, contact_email, project_phase").order("name")
  if (error) throw new Error(error.message)
  const { data: profiles } = await db.from("profiles").select("id, email, client_id").eq("role", "client")
  // Eingerichtet = schon angemeldet oder Passwort-Link genutzt.
  const signedIn = new Set<string>()
  for (let page = 1; ; page++) {
    const { data } = await db.auth.admin.listUsers({ page, perPage: 1000 })
    for (const u of data.users) if (u.last_sign_in_at) signedIn.add(u.id)
    if (data.users.length < 1000) break
  }
  const { data: links } = await db.from("password_links").select("user_id").not("used_at", "is", null)
  for (const l of links ?? []) signedIn.add(l.user_id)

  const recipients: Recipient[] = []
  const withoutEmail: string[] = []
  const onboarding: string[] = []
  for (const c of clients ?? []) {
    if (c.active === false || /^test\b/i.test(c.name)) continue
    if (c.project_phase === "onboarding") {
      onboarding.push(c.name)
      continue
    }
    const access = (profiles ?? []).filter((p) => p.client_id === c.id && p.email)
    if (access.some((p) => signedIn.has(p.id))) continue
    if (access.length) for (const p of access) recipients.push({ clientId: c.id, clientName: c.name, profileId: p.id, email: p.email! })
    else if (c.contact_email?.trim()) recipients.push({ clientId: c.id, clientName: c.name, profileId: null, email: c.contact_email.trim().toLowerCase() })
    else withoutEmail.push(c.name)
  }
  return { recipients, withoutEmail, onboarding }
}

async function main() {
  if (PREVIEW) {
    fs.writeFileSync(PREVIEW_FILE, mailHtml("https://kandidatenwerk.kanzleistelle24.de/passwort-setzen/BEISPIEL-LINK", "kanzlei@beispiel.de"))
    console.log(`Vorschau: ${PREVIEW_FILE}\nBetreff: ${SUBJECT}`)
    return
  }
  const { recipients, withoutEmail, onboarding } = await loadRecipients()
  const sent: string[] = fs.existsSync(SENT_LOG) ? JSON.parse(fs.readFileSync(SENT_LOG, "utf8")) : []
  const todo = recipients.filter((r) => !sent.includes(r.email))
  console.log(`MODUS: ${EXECUTE ? "VERSAND" : "Probelauf (verschickt nichts)"}`)
  console.log(`Empfänger: ${recipients.length} (${new Set(recipients.map((r) => r.clientId)).size} Kunden), davon schon verschickt: ${recipients.length - todo.length}`)
  console.log(`Neu anzulegende Zugänge (Kontakt-E-Mail): ${recipients.filter((r) => !r.profileId).length}`)
  console.log(`Kunden im Onboarding (bekommen nichts): ${onboarding.length}${onboarding.length ? ` – ${onboarding.join(", ")}` : ""}`)
  console.log(`Kunden ohne E-Mail-Adresse (bekommen nichts): ${withoutEmail.length}${withoutEmail.length ? ` – ${withoutEmail.join(", ")}` : ""}`)
  for (const r of todo) console.log(`  ${r.clientName} → ${r.email}${r.profileId ? "" : " (Zugang wird angelegt)"}`)
  if (!EXECUTE) return

  let ok = 0
  for (const r of todo) {
    try {
      let profileId = r.profileId
      if (!profileId) {
        const res = await ensurePortalAccess(r.clientId, r.email)
        if ("error" in res) throw new Error(res.error)
        profileId = res.profileId
      }
      const link = await createPasswordLink(profileId, null)
      await sendEmail([r.email], SUBJECT, mailHtml(link, r.email), {
        senderName: "Endlich Mitarbeiter",
        replyTo: { email: CONTACT.email, name: CONTACT.name },
      })
      await db.from("profiles").update({ portal_invited_at: new Date().toISOString() }).eq("id", profileId)
      sent.push(r.email)
      fs.writeFileSync(SENT_LOG, JSON.stringify(sent, null, 1))
      ok++
      console.log(`✓ ${r.clientName} → ${r.email}`)
    } catch (err) {
      console.error(`✗ ${r.clientName} → ${r.email}: ${err instanceof Error ? err.message : err}`)
    }
    await new Promise((res) => setTimeout(res, 400))
  }
  console.log(`Fertig: ${ok} von ${todo.length} verschickt.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
