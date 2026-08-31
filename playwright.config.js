// Playwright is used by the Scraper Agent (Phase 2) to load each test-set
// website, take a screenshot, and measure basic performance/mobile signals.
// This config is intentionally minimal in Phase 0 — it will be extended in
// Phase 2 with device emulation (mobile viewport) and timeout tuning once
// the Scraper Agent script exists.

/** @type {import('playwright').PlaywrightTestConfig} */
const config = {
  timeout: 30000,
  use: {
    headless: true,
    viewport: { width: 1280, height: 800 },
  },
};

module.exports = config;
