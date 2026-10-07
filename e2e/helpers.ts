import { expect, type Page } from "@playwright/test"

export const admin = { email: process.env.E2E_ADMIN_EMAIL, password: process.env.E2E_ADMIN_PASSWORD }
export const portal = { email: process.env.E2E_PORTAL_EMAIL, password: process.env.E2E_PORTAL_PASSWORD }

export async function login(page: Page, email: string, password: string) {
  await page.goto("/login")
  await page.getByLabel("E-Mail").fill(email)
  await page.getByLabel("Passwort", { exact: true }).fill(password)
  await page.getByRole("button", { name: "Anmelden" }).click()
  await expect(page).not.toHaveURL(/\/login/)
}

// Kein waagrechtes Scrollen (Kanzlei-Laptops, Handy).
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
}
