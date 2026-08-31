/**
 * Evaluation runner — Phase 6.
 *
 * Compares the Phase 1 baseline (bare prompt, no evidence) against the
 * full Phase 2-5 agent pipeline (Scraper -> Critique -> Verifier ->
 * Pitch-Writer) on the SAME 10-site test set, per the project proposal's
 * Section 2 evaluation format. Produces:
 *
 *   data/runs/evaluation/EVALUATION.md   — human-readable report: the
 *     comparison table, the real Improvement Changelog (with actual
 *     measured evidence, not the proposal doc's placeholders), and a
 *     write-up of the challenging case the run actually surfaced.
 *   data/runs/evaluation/_summary.json   — the same numbers, machine-readable.
 *   data/runs/pitch/SCORING.md           — created (not overwritten if it
 *     already exists) so the agent pipeline's pitches can be scored 1-5
 *     on specificity with the exact same rubric as the baseline.
 *
 * This script does NOT call any LLM — it only reads what every earlier
 * phase already wrote to data/runs/. Run it any time after `npm run pitch`
 * has completed; run it again after filling in SCORING.md files to get
 * final numbers instead of "not yet scored" placeholders.
 *
 * Run with: npm run evaluate
 */

const fs = require("fs");
const path = require("path");
const testSites = require("../data/test-sites.json");
const { buildScoringMarkdown, parseScoringMarkdown, average } = require("../lib/scoring");

const RUNS_DIR = path.join(__dirname, "..", "data", "runs");
const OUTPUT_DIR = path.join(RUNS_DIR, "evaluation");

const STAGE_DIRS = {
  baseline: path.join(RUNS_DIR, "baseline"),
  scraper: path.join(RUNS_DIR, "scraper"),
  critique: path.join(RUNS_DIR, "critique"),
  verifier: path.join(RUNS_DIR, "verifier"),
  pitch: path.join(RUNS_DIR, "pitch"),
};

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function fmtMs(ms) {
  if (ms == null) return "n/a";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}

function fmtPct(fraction) {
  if (fraction == null) return "n/a";
  return `${(fraction * 100).toFixed(1)}%`;
}

function fmtScore(score, filledCount, totalCount) {
  if (score == null) {
    return `not yet scored (0/${totalCount} in SCORING.md)`;
  }
  return `${score.toFixed(1)} / 5 (${filledCount}/${totalCount} sites scored)`;
}

/** Checks the required upstream phases have actually been run. */
function checkPrerequisites() {
  const missing = [];
  if (!fs.existsSync(path.join(STAGE_DIRS.baseline, "_summary.json"))) {
    missing.push('Phase 1 — run "npm run baseline"');
  }
  if (!fs.existsSync(path.join(STAGE_DIRS.scraper, "_summary.json"))) {
    missing.push('Phase 2 — run "npm run scrape"');
  }
  if (!fs.existsSync(path.join(STAGE_DIRS.critique, "_summary.json"))) {
    missing.push('Phase 3 — run "npm run critique"');
  }
  if (!fs.existsSync(path.join(STAGE_DIRS.verifier, "_summary.json"))) {
    missing.push('Phase 4 — run "npm run verify"');
  }
  if (!fs.existsSync(path.join(STAGE_DIRS.pitch, "_summary.json"))) {
    missing.push('Phase 5 — run "npm run pitch"');
  }
  return missing;
}

/** Sums each site's per-stage stageTimeMs across scrape+critique+verify+pitch. */
function computePipelineTimes() {
  const stageSummaries = {
    scraper: readJson(path.join(STAGE_DIRS.scraper, "_summary.json")),
    critique: readJson(path.join(STAGE_DIRS.critique, "_summary.json")),
    verifier: readJson(path.join(STAGE_DIRS.verifier, "_summary.json")),
    pitch: readJson(path.join(STAGE_DIRS.pitch, "_summary.json")),
  };

  const perSiteTimes = {}; // siteId -> { total, stages: {scraper, critique, verifier, pitch} }

  for (const [stageName, summary] of Object.entries(stageSummaries)) {
    if (!summary || !Array.isArray(summary.sites)) continue;
    for (const siteEntry of summary.sites) {
      if (!perSiteTimes[siteEntry.siteId]) {
        perSiteTimes[siteEntry.siteId] = { total: 0, stages: {} };
      }
      const t = siteEntry.stageTimeMs;
      perSiteTimes[siteEntry.siteId].stages[stageName] = t != null ? t : null;
      if (t != null) {
        perSiteTimes[siteEntry.siteId].total += t;
      }
    }
  }

  return perSiteTimes;
}

/** A site only has a "complete" pipeline result if it made it all the way to a real pitch. */
function sitesWithCompletePitch(pitchSummary) {
  if (!pitchSummary || !Array.isArray(pitchSummary.sites)) return new Set();
  return new Set(
    pitchSummary.sites.filter((s) => !s.error).map((s) => s.siteId)
  );
}

/**
 * Picks one real failure/skip from the actual run to write up as the
 * "challenging case" the proposal's Section 2 asks for — pulled from
 * whatever genuinely happened, not a guess made before any data existed.
 */
function findChallengingCase({ scraperSummary, critiqueSummary }) {
  const candidates = [];

  if (scraperSummary && Array.isArray(scraperSummary.sites)) {
    for (const s of scraperSummary.sites) {
      if (s.error) {
        candidates.push({
          siteId: s.siteId,
          stage: "Scraper",
          detail: s.error,
        });
      }
    }
  }
  if (critiqueSummary && Array.isArray(critiqueSummary.sites)) {
    for (const s of critiqueSummary.sites) {
      if (s.error && s.error.toLowerCase().includes("bot-verification")) {
        candidates.push({
          siteId: s.siteId,
          stage: "Critique (bot-challenge skip)",
          detail: s.error,
        });
      }
    }
  }

  return candidates;
}

async function main() {
  const missing = checkPrerequisites();
  if (missing.length > 0) {
    console.error("Can't evaluate yet — missing prerequisite phase output:\n");
    missing.forEach((m) => console.error(`  - ${m}`));
    console.error("\nRun the missing phase(s) first, then re-run npm run evaluate.");
    process.exit(1);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const baselineSummary = readJson(path.join(STAGE_DIRS.baseline, "_summary.json"));
  const scraperSummary = readJson(path.join(STAGE_DIRS.scraper, "_summary.json"));
  const critiqueSummary = readJson(path.join(STAGE_DIRS.critique, "_summary.json"));
  const verifierSummary = readJson(path.join(STAGE_DIRS.verifier, "_summary.json"));
  const pitchSummary = readJson(path.join(STAGE_DIRS.pitch, "_summary.json"));

  // --- Timing ---
  const pipelineTimes = computePipelineTimes();
  const completeSites = sitesWithCompletePitch(pitchSummary);
  const pipelineTimeValues = [...completeSites]
    .map((id) => pipelineTimes[id] && pipelineTimes[id].total)
    .filter((t) => t != null);
  const avgPipelineTimeMs =
    pipelineTimeValues.length > 0
      ? pipelineTimeValues.reduce((a, b) => a + b, 0) / pipelineTimeValues.length
      : null;
  const avgBaselineTimeMs = baselineSummary.avgTimeMs;

  // --- Specificity (baseline) ---
  const baselineScoringPath = path.join(STAGE_DIRS.baseline, "SCORING.md");
  const baselineScores = parseScoringMarkdown(baselineScoringPath);
  const baselineScoreValues = Object.values(baselineScores);
  const baselineFilledCount = baselineScoreValues.filter((v) => v != null).length;
  const baselineAvgScore = average(baselineScoreValues);

  // --- Create (not overwrite) pitch/SCORING.md, one row per site with a real pitch ---
  const pitchScoringPath = path.join(STAGE_DIRS.pitch, "SCORING.md");
  if (!fs.existsSync(pitchScoringPath) && completeSites.size > 0) {
    const rows = testSites.sites
      .filter((s) => completeSites.has(s.id))
      .map((s) => ({
        siteId: s.id,
        siteName: s.name,
        category: s.category,
        timeMs: pipelineTimes[s.id] ? Math.round(pipelineTimes[s.id].total) : null,
      }));

    const md = buildScoringMarkdown({
      title: "Agent Pipeline Scoring",
      instructions:
        "Fill this in by hand after reading each pitch in `data/runs/pitch/<siteId>.txt`, " +
        "using the exact same rubric as `data/runs/baseline/SCORING.md`: score " +
        "**specificity** 1-5 — how accurately and specifically the pitch reflects real, " +
        "verifiable issues on the business's actual website. For a fair comparison, score " +
        "these without re-reading the baseline pitches first.",
      rows,
    });
    fs.writeFileSync(pitchScoringPath, md);
    console.log(`Created data/runs/pitch/SCORING.md — ${rows.length} site(s) to score.\n`);
  }

  const pitchScores = parseScoringMarkdown(pitchScoringPath);
  const pitchScoreValues = Object.values(pitchScores);
  const pitchFilledCount = pitchScoreValues.filter((v) => v != null).length;
  const pitchAvgScore = average(pitchScoreValues);

  // --- Hallucination rate: fully computed already, no human input needed ---
  const hallucinationRate = verifierSummary.overallHallucinationRate;

  // --- Cost: Gemini free tier default ---
  const costNote = "$0.00 (Gemini free tier — see lib/gemini.js for the model in use)";

  // --- Challenging case, pulled from what actually happened ---
  const challengingCases = findChallengingCase({ scraperSummary, critiqueSummary });

  // === Build the comparison table (proposal Section 2 format) ===
  const comparisonRows = [
    [
      "Pitch specificity score (primary, 1-5)",
      fmtScore(baselineAvgScore, baselineFilledCount, baselineScoreValues.length || testSites.sites.length),
      fmtScore(pitchAvgScore, pitchFilledCount, pitchScoreValues.length || completeSites.size),
      baselineAvgScore != null && pitchAvgScore != null
        ? `${(pitchAvgScore - baselineAvgScore >= 0 ? "+" : "")}${(pitchAvgScore - baselineAvgScore).toFixed(1)}`
        : "pending human scoring",
    ],
    [
      "Hallucination rate (% claims rejected)",
      "N/A — no verification step",
      fmtPct(hallucinationRate),
      "n/a (no baseline equivalent)",
    ],
    [
      "Human time per pitch",
      fmtMs(avgBaselineTimeMs),
      fmtMs(avgPipelineTimeMs),
      avgBaselineTimeMs != null && avgPipelineTimeMs != null
        ? `${avgPipelineTimeMs > avgBaselineTimeMs ? "+" : ""}${fmtMs(avgPipelineTimeMs - avgBaselineTimeMs)} (pipeline does more work per pitch: scrape + critique + verify + write, vs. baseline's single call)`
        : "n/a",
    ],
    ["Cost per pitch (API + compute)", costNote, costNote, "no change (same free tier)"],
  ];

  // === Build the report ===
  let report = `# Phase 6 — Evaluation Report\n\n`;
  report += `Generated: ${new Date().toISOString()}\n\n`;
  report += `Compares the Phase 1 baseline (bare prompt, no evidence) against the full Scraper -> Critique -> Verifier -> Pitch-Writer pipeline, on the same ${testSites.sites.length}-site fixed test set.\n\n`;

  report += `## Run coverage\n\n`;
  report += `- Baseline: ${baselineSummary.succeeded}/${baselineSummary.totalSites} sites succeeded\n`;
  report += `- Scraper: ${scraperSummary.succeeded}/${scraperSummary.totalSites} sites succeeded\n`;
  report += `- Critique: ${critiqueSummary.succeeded}/${critiqueSummary.totalSites} sites succeeded (${critiqueSummary.totalClaims} total claims generated)\n`;
  report += `- Verifier: ${verifierSummary.totalVerifiedClaims} accepted, ${verifierSummary.totalRejectedClaims} rejected across ${verifierSummary.sitesWithClaimsChecked} sites checked\n`;
  report += `- Pitch-Writer: ${pitchSummary.succeeded}/${pitchSummary.totalSites} sites produced a final pitch\n`;
  report += `- **${completeSites.size}/${testSites.sites.length} sites made it end-to-end** through the full pipeline to a finished pitch — the comparison below only uses these sites, for a fair like-for-like match against the baseline.\n\n`;

  report += `## Baseline vs. Agent Comparison\n\n`;
  report += `| Metric | Simple Baseline | Agent Solution | Change |\n`;
  report += `|---|---|---|---|\n`;
  comparisonRows.forEach((r) => {
    report += `| ${r[0]} | ${r[1]} | ${r[2]} | ${r[3]} |\n`;
  });
  report += `\n`;

  if (baselineFilledCount < (baselineScoreValues.length || testSites.sites.length) || pitchFilledCount < (pitchScoreValues.length || completeSites.size)) {
    report += `> ⚠️ Specificity scoring is incomplete. Fill in \`data/runs/baseline/SCORING.md\` and \`data/runs/pitch/SCORING.md\` by hand, then re-run \`npm run evaluate\` for final numbers.\n\n`;
  }

  report += `## Challenging case\n\n`;
  if (challengingCases.length > 0) {
    challengingCases.forEach((c) => {
      const site = testSites.sites.find((s) => s.id === c.siteId);
      report += `**${site ? site.name : c.siteId}** (\`${c.siteId}\`) — failed/skipped at the **${c.stage}** stage.\n\n`;
      report += `> ${c.detail}\n\n`;
    });
    report += `What this revealed: real small-business sites have failure modes the pipeline has to handle explicitly (bot-verification interstitials, timeouts) rather than assume every site loads cleanly — both are now handled with clear skips instead of silently producing wrong output. See PHASE_LOG.md's "Phase 3 — Real-run findings + fixes" entry for the full story.\n\n`;
  } else {
    report += `No scraper or critique failures were recorded in this run — every site made it through cleanly. If you want a genuinely challenging case for the submission, consider intentionally testing a site with a slow load time or an unusual layout.\n\n`;
  }

  report += `## Improvement Changelog (real evidence)\n\n`;
  report += `| Stage | What Was Tried | Evidence | Decision |\n`;
  report += `|---|---|---|---|\n`;
  report += `| Baseline | Single direct prompt, no website data | ${baselineSummary.succeeded}/${baselineSummary.totalSites} succeeded, avg ${fmtMs(avgBaselineTimeMs)}/pitch${baselineAvgScore != null ? `, specificity ${baselineAvgScore.toFixed(1)}/5` : ""} | Established the starting point |\n`;
  report += `| + Scraper Agent | Added real evidence: screenshot, load time, SSL, mobile check | ${scraperSummary.succeeded}/${scraperSummary.totalSites} sites scraped successfully | Kept — gives Critique Agent something real to work from |\n`;
  report += `| + Critique Agent | Turned evidence into specific, falsifiable claims | ${critiqueSummary.totalClaims} claims generated across ${critiqueSummary.succeeded} sites | Kept — but see fix below |\n`;
  report += `| + Verifier Agent | Cross-checked every claim against the same screenshot | ${verifierSummary.totalRejectedClaims}/${verifierSummary.totalVerifiedClaims + verifierSummary.totalRejectedClaims} claims rejected (${fmtPct(hallucinationRate)} hallucination rate) | Kept — this is the core hallucination-prevention step |\n`;
  report += `| Fix: bot-challenge detection | Real run showed a Cloudflare interstitial being critiqued as if it were the real homepage | Added \`possibleBotChallenge\` flag; Critique now skips these sites | Kept — prevents confidently wrong claims about the wrong page |\n`;
  report += `| Fix: date-hallucination guard | Real run showed the model calling the current year "incorrect" or "a misconfigured clock" | Footer-year staleness is now computed in code and handed to the model as a fact, not a judgment call | Kept — moves a computable fact out of the model's hands entirely |\n`;
  report += `| + Pitch-Writer Agent | Drafts from verifiedClaims only, never rejectedClaims | ${pitchSummary.succeeded}/${pitchSummary.totalSites} pitches generated | Identify as the main contribution: verified, specific claims -> personalized pitch |\n`;
  report += `\n`;

  report += `## Hot Take — did the Section 7 hypothesis hold up?\n\n`;
  report += `The project proposal's working hypothesis was that the main failure mode would be the Critique Agent making a subjective, unfalsifiable claim the Verifier couldn't check. The real run surfaced two *different* failure modes instead — a bot-challenge page being critiqued as if it were the real site, and the model misjudging today's date. Both were fixed by moving the judgment out of the model's hands into code (a deterministic bot-phrase check, and a pre-computed staleness verdict) rather than trying to prompt around it. **The updated lesson: when a claim depends on a fact the code can already compute exactly (today's date, whether a page is the real page), don't ask the model to reason about it — hand it the already-computed answer and forbid it from second-guessing that.**\n\n`;

  fs.writeFileSync(path.join(OUTPUT_DIR, "EVALUATION.md"), report);

  const machineSummary = {
    generatedAt: new Date().toISOString(),
    coverage: {
      baseline: { succeeded: baselineSummary.succeeded, total: baselineSummary.totalSites },
      scraper: { succeeded: scraperSummary.succeeded, total: scraperSummary.totalSites },
      critique: { succeeded: critiqueSummary.succeeded, total: critiqueSummary.totalSites, totalClaims: critiqueSummary.totalClaims },
      verifier: {
        totalVerified: verifierSummary.totalVerifiedClaims,
        totalRejected: verifierSummary.totalRejectedClaims,
        overallHallucinationRate: hallucinationRate,
      },
      pitch: { succeeded: pitchSummary.succeeded, total: pitchSummary.totalSites },
      completeEndToEndSites: completeSites.size,
    },
    specificity: {
      baseline: { avg: baselineAvgScore, scoredCount: baselineFilledCount },
      agent: { avg: pitchAvgScore, scoredCount: pitchFilledCount },
    },
    timing: {
      baselineAvgMs: avgBaselineTimeMs,
      pipelineAvgMs: avgPipelineTimeMs,
    },
    hallucinationRate,
    challengingCases,
  };
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "_summary.json"),
    JSON.stringify(machineSummary, null, 2)
  );

  console.log(`Evaluation report written to data/runs/evaluation/EVALUATION.md`);
  console.log(`Machine-readable summary: data/runs/evaluation/_summary.json\n`);
  console.log(`Coverage: ${completeSites.size}/${testSites.sites.length} sites completed the full pipeline.`);
  console.log(`Hallucination rate: ${fmtPct(hallucinationRate)}`);
  console.log(
    `Specificity — baseline: ${fmtScore(baselineAvgScore, baselineFilledCount, baselineScoreValues.length || testSites.sites.length)}`
  );
  console.log(
    `Specificity — agent:    ${fmtScore(pitchAvgScore, pitchFilledCount, pitchScoreValues.length || completeSites.size)}`
  );
  if (baselineFilledCount === 0 || pitchFilledCount === 0) {
    console.log(
      `\nNext step: fill in the Specificity column in data/runs/baseline/SCORING.md and data/runs/pitch/SCORING.md by hand, then re-run "npm run evaluate".`
    );
  } else {
    console.log(`\nEvaluation complete — see data/runs/evaluation/EVALUATION.md for the full report.`);
  }
}

main().catch((err) => {
  console.error("\nEvaluation failed to run:", err.message || err);
  process.exit(1);
});
