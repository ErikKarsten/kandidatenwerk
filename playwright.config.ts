import { defineConfig, devices } from "@playwright/test"
import dotenv from "dotenv"

// Testzugänge (E2E_*) aus .env.local, angelegt von scripts/live-testbereich.ts.
dotenv.config({ path: ".env.local", quiet: true })

// End-to-End-Tests (T-101). Laufen gegen eine bereits deployte Umgebung, standardmäßig
// Staging bzw. bis zum Launch Live (E2E_BASE_URL). Ohne Logins (E2E_ADMIN_*, E2E_PORTAL_*) laufen nur die
// öffentlichen Prüfungen - so sind sie auch gegen Live gefahrlos (nur lesend).
//   E2E_BASE_URL=https://... npx playwright test
//   npx playwright test --project=chromium   (schnell, nur ein Browser)
export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  retries: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    locale: "de-DE",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "handy", use: { ...devices["iPhone 13"] } },
    // Kanzlei-Standard: Edge/Windows auf kleinem Bildschirm
    { name: "laptop-klein", use: { ...devices["Desktop Edge"], channel: undefined, viewport: { width: 1366, height: 768 } } },
  ],
})
