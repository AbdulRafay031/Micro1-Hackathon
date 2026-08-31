/**
 * Pitch-Writer Agent runner — Phase 5.
 *
 * Reads each site's saved Verifier Agent output from
 * data/runs/verifier/<siteId>.json, runs the Pitch-Writer Agent (Gemini
 * text) on each — using ONLY verifiedClaims, never rejected or raw
 * critique claims — and saves the resulting pitch under data/runs/pitch/.
 *
 * Requires `npm run verify` to have been run first.
 *
 * Run with: npm run pitch
 */

const fs = require("fs");
const path = require("path");
const testSites = require("../data/test-sites.json");
const { runPitchWriterAgent } = require("../lib/agents/pitchWriter");

const VERIFIER_DIR = path.join(__dirname, "..", "data", "runs", "verifier");
const OUTPUT_DIR = path.join(__dirname, "..", "data", "runs", "pitch");

const DELAY_MS = 4000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function loadJson(dir, siteId) {
  const filePath = path.join(dir, `${siteId}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

async function main() {
  if (!fs.existsSync(VERIFIER_DIR)) {
    console.error(
      `No verifier output found at data/runs/verifier/ — run "npm run verify" first (Phase 4).`
    );
    process.exit(1);
  }

  console.log(`Pitch-Writer Agent — test set: ${testSites.sites.length} sites`);
  console.log(`Output: data/runs/pitch/\n`);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const results = [];
  for (let i = 0; i < testSites.sites.length; i++) {
    const site = testSites.sites[i];
    process.stdout.write(`[${i + 1}/${testSites.sites.length}] ${site.name} ... `);

    const verifierResult = loadJson(VERIFIER_DIR, site.id);
    const startedAt = Date.now();

    let result;
    if (!verifierResult) {
      result = {
        siteId: site.id,
        pitch: null,
        usedClaims: [],
        error: `No verifier evidence found for "${site.id}" — did "npm run verify" run for this site?`,
      };
    } else {
      result = await runPitchWriterAgent(verifierResult, site);
    }
    result.stageTimeMs = Date.now() - startedAt; // wall-clock for this stage — used by Phase 6's timing comparison

    results.push(result);
    fs.writeFileSync(
      path.join(OUTPUT_DIR, `${site.id}.json`),
      JSON.stringify(result, null, 2)
    );
    if (result.pitch) {
      fs.writeFileSync(path.join(OUTPUT_DIR, `${site.id}.txt`), result.pitch);
    }

    if (result.error) {
      console.log(`SKIPPED/FAILED — ${result.error}`);
    } else {
      const flag = result.warning ? " (warning: usedIndices unconfirmed)" : "";
      console.log(`done (${result.usedClaims.length} claims referenced)${flag}`);
    }

    if (i < testSites.sites.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  const succeeded = results.filter((r) => r.pitch).length;
  const failed = results.length - succeeded;

  const summary = {
    runAt: new Date().toISOString(),
    totalSites: results.length,
    succeeded,
    failed,
    sites: results.map((r) => ({
      siteId: r.siteId,
      error: r.error,
      usedClaimCount: r.usedClaims.length,
      warning: r.warning || null,
      stageTimeMs: r.stageTimeMs || null,
    })),
  };

  fs.writeFileSync(
    path.join(OUTPUT_DIR, "_summary.json"),
    JSON.stringify(summary, null, 2)
  );

  console.log(`\n${succeeded}/${results.length} pitches generated.`);
  if (failed > 0) {
    console.log(
      `${failed} site(s) failed or were skipped — check the "error" field in their .json file in data/runs/pitch/.`
    );
  }
  console.log(`\nPitches saved to data/runs/pitch/. This completes the core agent pipeline —`);
  console.log(`next is Phase 6 (evaluation): compare these against data/runs/baseline/ for specificity.`);
}

main().catch((err) => {
  console.error("\nPitch run failed to start:", err.message || err);
  process.exit(1);
});
