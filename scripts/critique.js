/**
 * Critique Agent runner — Phase 3.
 *
 * Reads each site's saved evidence from data/runs/scraper/<siteId>.json
 * (written by `npm run scrape` in Phase 2), runs the Critique Agent
 * (Gemini vision) on each, and saves the resulting claims under
 * data/runs/critique/.
 *
 * Requires `npm run scrape` to have been run first — this script reads
 * its output rather than re-scraping.
 *
 * Run with: npm run critique
 */

const fs = require("fs");
const path = require("path");
const testSites = require("../data/test-sites.json");
const { runCritiqueAgent } = require("../lib/agents/critique");

const SCRAPER_DIR = path.join(__dirname, "..", "data", "runs", "scraper");
const OUTPUT_DIR = path.join(__dirname, "..", "data", "runs", "critique");

// Same rate-limit courtesy as the Phase 1 baseline script — stay under the
// Gemini free-tier requests-per-minute limit.
const DELAY_MS = 4000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function loadScraperResult(siteId) {
  const filePath = path.join(SCRAPER_DIR, `${siteId}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

async function main() {
  if (!fs.existsSync(SCRAPER_DIR)) {
    console.error(
      `No scraper output found at data/runs/scraper/ — run "npm run scrape" first (Phase 2).`
    );
    process.exit(1);
  }

  console.log(`Critique Agent — test set: ${testSites.sites.length} sites`);
  console.log(`Output: data/runs/critique/\n`);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const results = [];
  for (let i = 0; i < testSites.sites.length; i++) {
    const site = testSites.sites[i];
    process.stdout.write(`[${i + 1}/${testSites.sites.length}] ${site.name} ... `);

    const scraperResult = loadScraperResult(site.id);
    const startedAt = Date.now();
    if (!scraperResult) {
      const result = {
        siteId: site.id,
        claims: [],
        error: `No scraper evidence found for "${site.id}" — did "npm run scrape" run for this site?`,
      };
      results.push(result);
      fs.writeFileSync(
        path.join(OUTPUT_DIR, `${site.id}.json`),
        JSON.stringify(result, null, 2)
      );
      console.log("SKIPPED — no scraper evidence");
      continue;
    }

    const result = await runCritiqueAgent(scraperResult);
    result.stageTimeMs = Date.now() - startedAt; // wall-clock for this stage's Gemini call — used by Phase 6's timing comparison
    results.push(result);

    fs.writeFileSync(
      path.join(OUTPUT_DIR, `${site.id}.json`),
      JSON.stringify(result, null, 2)
    );

    if (result.error) {
      console.log(`FAILED — ${result.error}`);
    } else {
      console.log(`done (${result.claims.length} claims)`);
    }

    // Only delay if we actually made a Gemini call (skip the wait on the
    // last iteration and on sites that were skipped/errored before calling).
    if (i < testSites.sites.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  const succeeded = results.filter((r) => !r.error).length;
  const failed = results.length - succeeded;
  const totalClaims = results.reduce((sum, r) => sum + r.claims.length, 0);

  const summary = {
    runAt: new Date().toISOString(),
    totalSites: results.length,
    succeeded,
    failed,
    totalClaims,
    sites: results.map((r) => ({
      siteId: r.siteId,
      error: r.error,
      claimCount: r.claims.length,
      stageTimeMs: r.stageTimeMs || null,
    })),
  };

  fs.writeFileSync(
    path.join(OUTPUT_DIR, "_summary.json"),
    JSON.stringify(summary, null, 2)
  );

  console.log(`\n${succeeded}/${results.length} succeeded, ${totalClaims} total claims generated.`);
  if (failed > 0) {
    console.log(
      `${failed} site(s) failed or were skipped — check the "error" field in their .json file in data/runs/critique/.`
    );
  }
  console.log(
    `\nClaims saved to data/runs/critique/. Next: Phase 4 (Verifier Agent) will cross-check each claim against the same evidence.`
  );
}

main().catch((err) => {
  console.error("\nCritique run failed to start:", err.message || err);
  process.exit(1);
});
