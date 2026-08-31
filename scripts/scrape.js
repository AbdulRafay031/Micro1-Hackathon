/**
 * Scraper Agent runner — Phase 2.
 *
 * Loops over data/test-sites.json, runs the Scraper Agent (Playwright) on
 * each site, and saves the structured evidence (screenshot paths, load
 * time, SSL status, mobile responsiveness, last-updated signal) under
 * data/runs/scraper/.
 *
 * Run with: npm run scrape
 *
 * Requires the Chromium binary — if you haven't already, run:
 *   npm run playwright:install
 */

const fs = require("fs");
const path = require("path");
const testSites = require("../data/test-sites.json");
const { runScraperAgent } = require("../lib/agents/scraper");

const OUTPUT_DIR = path.join(__dirname, "..", "data", "runs", "scraper");

async function main() {
  console.log(`Scraper Agent — test set: ${testSites.sites.length} sites`);
  console.log(`Output: data/runs/scraper/\n`);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const results = [];
  for (let i = 0; i < testSites.sites.length; i++) {
    const site = testSites.sites[i];
    process.stdout.write(`[${i + 1}/${testSites.sites.length}] ${site.name} ... `);

    const startedAt = Date.now();
    const result = await runScraperAgent(site);
    result.stageTimeMs = Date.now() - startedAt; // wall-clock for this whole stage (desktop+mobile passes) — used by Phase 6's timing comparison; separate from result.loadTimeMs, which is just the desktop page's own load time.
    results.push(result);

    fs.writeFileSync(
      path.join(OUTPUT_DIR, `${site.id}.json`),
      JSON.stringify(result, null, 2)
    );

    if (result.error) {
      console.log(`FAILED — ${result.error}`);
    } else {
      console.log(
        `done (${result.loadTimeMs}ms, ssl: ${result.hasSsl}, mobile-ok: ${result.isMobileResponsive})`
      );
    }
  }

  const succeeded = results.filter((r) => !r.error).length;
  const failed = results.length - succeeded;

  const summary = {
    runAt: new Date().toISOString(),
    totalSites: results.length,
    succeeded,
    failed,
    sites: results.map((r) => ({
      siteId: r.siteId,
      error: r.error,
      loadTimeMs: r.loadTimeMs,
      stageTimeMs: r.stageTimeMs,
      hasSsl: r.hasSsl,
      isMobileResponsive: r.isMobileResponsive,
      lastUpdatedSignal: r.lastUpdatedSignal,
    })),
  };

  fs.writeFileSync(
    path.join(OUTPUT_DIR, "_summary.json"),
    JSON.stringify(summary, null, 2)
  );

  console.log(`\n${succeeded}/${results.length} succeeded.`);
  if (failed > 0) {
    console.log(
      `${failed} site(s) failed — check the "error" field in their .json file in data/runs/scraper/.`
    );
  }
  console.log(
    `\nScreenshots + evidence saved to data/runs/scraper/. Next: Phase 3 (Critique Agent).`
  );
}

main().catch((err) => {
  console.error("\nScraper run failed to start:", err.message || err);
  process.exit(1);
});
