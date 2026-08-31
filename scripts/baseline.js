/**
 * Baseline runner — Phase 1 (IMPLEMENTED).
 *
 * Per the hackathon brief and project proposal (Section 2), the baseline
 * is a single direct prompt with NO website data: "Write a cold outreach
 * pitch for [business name]." No scraping, no verification, no evidence —
 * this is the generic-template approach the agent pipeline (Phases 2-5)
 * is meant to beat.
 *
 * Run with: npm run baseline
 *
 * Output:
 *   data/runs/baseline/<siteId>.json   — full record (prompt, pitch, timing)
 *   data/runs/baseline/<siteId>.txt    — just the pitch text, easy to read
 *   data/runs/baseline/_summary.json   — run-level stats (success/fail, avg time)
 *   data/runs/baseline/SCORING.md      — table to manually fill in specificity scores
 */

const fs = require("fs");
const path = require("path");
const testSites = require("../data/test-sites.json");
const { generateText, getClient, DEFAULT_MODEL } = require("../lib/gemini");

const OUTPUT_DIR = path.join(__dirname, "..", "data", "runs", "baseline");

// Small delay between calls so a 10-site run stays comfortably under
// Gemini's free-tier per-minute rate limit, even on a slower plan.
const DELAY_BETWEEN_CALLS_MS = 4000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The exact baseline prompt. Deliberately bare — no scraped evidence, no
 * business category, no location — because that's what makes it a fair
 * "before" comparison against the full pipeline in Phase 6.
 */
function buildBaselinePrompt(site) {
  return `Write a cold outreach pitch for ${site.name}.`;
}

async function runOne(site, index, total) {
  const prompt = buildBaselinePrompt(site);
  process.stdout.write(`[${index + 1}/${total}] ${site.name} ... `);

  const startedAt = Date.now();
  let pitchText = null;
  let errorMessage = null;

  try {
    pitchText = await generateText(prompt);
  } catch (err) {
    errorMessage = err && err.message ? err.message : String(err);
  }

  const timeMs = Date.now() - startedAt;

  const record = {
    siteId: site.id,
    siteName: site.name,
    category: site.category,
    location: site.location,
    url: site.url,
    model: DEFAULT_MODEL,
    prompt,
    pitch: pitchText,
    error: errorMessage,
    timeMs,
    generatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(
    path.join(OUTPUT_DIR, `${site.id}.json`),
    JSON.stringify(record, null, 2)
  );

  if (pitchText) {
    fs.writeFileSync(path.join(OUTPUT_DIR, `${site.id}.txt`), pitchText);
    console.log(`done (${timeMs}ms)`);
  } else {
    console.log(`FAILED — ${errorMessage}`);
  }

  return record;
}

function buildScoringTemplate(records) {
  const header =
    `# Baseline Scoring\n\n` +
    `Fill this in by hand after reading each pitch in this folder ` +
    `(\`<siteId>.txt\`). Score **specificity** 1-5 per the project ` +
    `proposal (Section 2): how accurately and specifically the pitch ` +
    `reflects real, verifiable issues on the business's actual website. ` +
    `The baseline was never shown the website, so low scores here are ` +
    `expected — that gap is the point of the comparison in Phase 6.\n\n` +
    `| Site ID | Site | Category | Time (ms) | Specificity (1-5) | Notes |\n` +
    `|---|---|---|---|---|---|\n`;

  const rows = records
    .map(
      (r) =>
        `| ${r.siteId} | ${r.siteName} | ${r.category} | ${r.timeMs} | _fill in_ | _fill in_ |`
    )
    .join("\n");

  return header + rows + "\n";
}

async function main() {
  console.log(`Baseline runner — model: ${DEFAULT_MODEL}`);
  console.log(`Test set: ${testSites.sites.length} sites`);
  console.log(`Output: data/runs/baseline/\n`);

  // Fail fast if the API key is missing, instead of burning through the
  // whole loop (with delays) only to fail 10 times in a row.
  try {
    getClient();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const records = [];
  for (let i = 0; i < testSites.sites.length; i++) {
    const record = await runOne(testSites.sites[i], i, testSites.sites.length);
    records.push(record);
    if (i < testSites.sites.length - 1) {
      await sleep(DELAY_BETWEEN_CALLS_MS);
    }
  }

  const succeeded = records.filter((r) => r.pitch).length;
  const failed = records.length - succeeded;
  const avgTimeMs = Math.round(
    records.filter((r) => r.pitch).reduce((sum, r) => sum + r.timeMs, 0) /
      (succeeded || 1)
  );

  const summary = {
    runAt: new Date().toISOString(),
    model: DEFAULT_MODEL,
    totalSites: records.length,
    succeeded,
    failed,
    avgTimeMs,
    sites: records.map((r) => ({
      siteId: r.siteId,
      siteName: r.siteName,
      timeMs: r.timeMs,
      error: r.error,
    })),
  };

  fs.writeFileSync(
    path.join(OUTPUT_DIR, "_summary.json"),
    JSON.stringify(summary, null, 2)
  );
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "SCORING.md"),
    buildScoringTemplate(records)
  );

  console.log(`\n${succeeded}/${records.length} succeeded, avg ${avgTimeMs}ms per pitch.`);
  if (failed > 0) {
    console.log(
      `${failed} site(s) failed — check the "error" field in their .json file (likely a rate limit; delete that site's .json and re-run, or wait a minute and rerun everything).`
    );
  }
  console.log(`\nNext step: open data/runs/baseline/SCORING.md and fill in`);
  console.log(`the specificity score for each pitch by hand.`);
}

main().catch((err) => {
  console.error("\nBaseline run failed to start:", err.message || err);
  process.exit(1);
});
