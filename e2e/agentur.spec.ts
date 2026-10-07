import { expect, test } from "@playwright/test"
import { admin, expectNoHorizontalScroll, login } from "./helpers"

// Mit Agentur-Login - nur auf Staging (E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD).
test.skip(!admin.email || !admin.password, "E2E_ADMIN_* nicht gesetzt")

test.beforeEach(async ({ page }) => {
  await login(page, admin.email!, admin.password!)
})

test("Dashboard und Hauptbereiche laden", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible()
  for (const [path, heading] of [
    ["/dashboard/candidates", "Kandidaten"],
    ["/dashboard/clients", "Kunden"],
    ["/dashboard/campaigns", "Kampagnen"],
    ["/dashboard/tasks", "Aufgaben"],
    ["/dashboard/einstellungen", "Einstellungen"],
  ]) {
    await page.goto(path)
    await expect(page.getByRole("heading", { name: heading, exact: true }).first()).toBeVisible()
  }
})

test("Kandidatenliste zeigt Testkandidaten", async ({ page }) => {
  await page.goto("/dashboard/candidates")
  await expect(page.getByText("Ben").first()).toBeVisible()
})

test("Portal ist für Agentur gesperrt", async ({ page }) => {
  await page.goto("/portal")
  await expect(page).toHaveURL(/\/dashboard/)
})

test("Kandidatenseite ohne waagrechtes Scrollen", async ({ page }) => {
  await page.goto("/dashboard/candidates")
  await expectNoHorizontalScroll(page)
})
