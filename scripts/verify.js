/**
 * Verifier Agent runner — Phase 4.
 *
 * Reads each site's saved Critique Agent output from
 * data/runs/critique/<siteId>.json and the matching Scraper Agent
 * evidence from data/runs/scraper/<siteId>.json, runs the Verifier
 * Agent (Gemini vision) on each, and saves the accept/reject split
 * under data/runs/verifier/.
 *
 * Requires `npm run scrape` AND `npm run critique` to have been run
 * first — this script reads their output rather than regenerating it.
 *
 * Run with: npm run verify
 */

const fs = require("fs");
const path = require("path");
const testSites = require("../data/test-sites.json");
const { runVerifierAgent } = require("../lib/agents/verifier");

const SCRAPER_DIR = path.join(__dirname, "..", "data", "runs", "scraper");
const CRITIQUE_DIR = path.join(__dirname, "..", "data", "runs", "critique");
const OUTPUT_DIR = path.join(__dirname, "..", "data", "runs", "verifier");

// Same rate-limit courtesy as the baseline and critique scripts.
const DELAY_MS = 4000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function loadJson(dir, siteId) {
  const filePath = path.join(dir, `${siteId}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

async function main() {
  if (!fs.existsSync(CRITIQUE_DIR)) {
    console.error(
      `No critique output found at data/runs/critique/ — run "npm run critique" first (Phase 3).`
    );
    process.exit(1);
  }

  console.log(`Verifier Agent — test set: ${testSites.sites.length} sites`);
  console.log(`Output: data/runs/verifier/\n`);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const results = [];
  for (let i = 0; i < testSites.sites.length; i++) {
    const site = testSites.sites[i];
    process.stdout.write(`[${i + 1}/${testSites.sites.length}] ${site.name} ... `);

    const critiqueResult = loadJson(CRITIQUE_DIR, site.id);
    const scraperResult = loadJson(SCRAPER_DIR, site.id);
    const startedAt = Date.now();

    let result;
    if (!critiqueResult) {
      result = {
        siteId: site.id,
        verifiedClaims: [],
        rejectedClaims: [],
        hallucinationRate: null,
        error: `No critique evidence found for "${site.id}" — did "npm run critique" run for this site?`,
      };
    } else {
      result = await runVerifierAgent(critiqueResult, scraperResult);
    }
    result.stageTimeMs = Date.now() - startedAt; // wall-clock for this stage — used by Phase 6's timing comparison

    results.push(result);
    fs.writeFileSync(
      path.join(OUTPUT_DIR, `${site.id}.json`),
      JSON.stringify(result, null, 2)
    );

    if (result.error) {
      console.log(`SKIPPED/FAILED — ${result.error}`);
    } else {
      console.log(
        `done (${result.verifiedClaims.length} accepted, ${result.rejectedClaims.length} rejected)`
      );
    }

    if (i < testSites.sites.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  const withClaims = results.filter((r) => r.hallucinationRate !== null);
  const totalVerified = results.reduce((sum, r) => sum + r.verifiedClaims.length, 0);
  const totalRejected = results.reduce((sum, r) => sum + r.rejectedClaims.length, 0);
  const totalClaims = totalVerified + totalRejected;
  const overallHallucinationRate = totalClaims > 0 ? totalRejected / totalClaims : null;

  const summary = {
    runAt: new Date().toISOString(),
    totalSites: results.length,
    sitesWithClaimsChecked: withClaims.length,
    totalVerifiedClaims: totalVerified,
    totalRejectedClaims: totalRejected,
    overallHallucinationRate,
    sites: results.map((r) => ({
      siteId: r.siteId,
      error: r.error,
      verifiedCount: r.verifiedClaims.length,
      rejectedCount: r.rejectedClaims.length,
      hallucinationRate: r.hallucinationRate,
      stageTimeMs: r.stageTimeMs || null,
    })),
  };

  fs.writeFileSync(
    path.join(OUTPUT_DIR, "_summary.json"),
    JSON.stringify(summary, null, 2)
  );

  console.log(
    `\n${totalVerified} claims accepted, ${totalRejected} rejected across ${withClaims.length} sites checked.`
  );
  if (overallHallucinationRate !== null) {
    console.log(`Overall hallucination rate: ${(overallHallucinationRate * 100).toFixed(1)}%`);
  }
  console.log(
    `\nResults saved to data/runs/verifier/. Next: Phase 5 (Pitch-Writer Agent) will draft pitches from verifiedClaims only.`
  );
}

main().catch((err) => {
  console.error("\nVerifier run failed to start:", err.message || err);
  process.exit(1);
});
