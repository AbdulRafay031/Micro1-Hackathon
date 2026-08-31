/**
 * Server-only helper for the dashboard (app/page.js).
 *
 * Reads whatever's on disk under data/runs/<stage>/<siteId>.json for each
 * pipeline stage and assembles one status object per site. Deliberately
 * tolerant of missing files — a phase that hasn't been run yet (or a site
 * that got skipped upstream) should render as "not reached", not crash
 * the dashboard.
 */

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.join(process.cwd());
const RUNS_DIR = path.join(REPO_ROOT, "data", "runs");

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    return { __parseError: err.message };
  }
}

function readStageSummary(stage) {
  return readJsonIfExists(path.join(RUNS_DIR, stage, "_summary.json"));
}

// Collapses one site's raw per-stage JSON into a single status the
// dashboard renders as a 4-step trail: scrape -> critique -> verify -> pitch.
function deriveSiteStatus(site) {
  const scraper = readJsonIfExists(path.join(RUNS_DIR, "scraper", `${site.id}.json`));
  const critique = readJsonIfExists(path.join(RUNS_DIR, "critique", `${site.id}.json`));
  const verifier = readJsonIfExists(path.join(RUNS_DIR, "verifier", `${site.id}.json`));
  const pitch = readJsonIfExists(path.join(RUNS_DIR, "pitch", `${site.id}.json`));

  let scrapeStage = { state: "not-run", label: "Not run yet" };
  if (scraper) {
    if (scraper.error) {
      scrapeStage = { state: "error", label: "Failed", detail: scraper.error };
    } else if (scraper.possibleBotChallenge) {
      scrapeStage = { state: "warning", label: "Bot-check page captured", detail: "Scraper flagged this screenshot as a likely bot-verification interstitial, not the real homepage." };
    } else {
      scrapeStage = { state: "ok", label: "Captured", detail: `${scraper.loadTimeMs}ms load, SSL ${scraper.hasSsl ? "valid" : "missing"}, ${scraper.isMobileResponsive ? "mobile OK" : "mobile overflow"}` };
    }
  }

  let critiqueStage = { state: "not-run", label: "Not run yet" };
  if (critique) {
    if (critique.error) {
      critiqueStage = { state: "skipped", label: "Skipped", detail: critique.error };
    } else {
      critiqueStage = { state: "ok", label: `${critique.claims.length} claim${critique.claims.length === 1 ? "" : "s"}`, claims: critique.claims };
    }
  }

  let verifyStage = { state: "not-run", label: "Not run yet" };
  if (verifier) {
    if (verifier.error) {
      verifyStage = { state: "skipped", label: "Skipped", detail: verifier.error };
    } else {
      const total = verifier.verifiedClaims.length + verifier.rejectedClaims.length;
      verifyStage = {
        state: verifier.rejectedClaims.length > 0 ? "mixed" : "ok",
        label: `${verifier.verifiedClaims.length}/${total} accepted`,
        hallucinationRate: verifier.hallucinationRate,
        verifiedClaims: verifier.verifiedClaims,
        rejectedClaims: verifier.rejectedClaims,
      };
    }
  }

  let pitchStage = { state: "not-run", label: "Not built yet (Phase 5)" };
  if (pitch) {
    pitchStage = pitch.error
      ? { state: "skipped", label: "Skipped", detail: pitch.error }
      : { state: "ok", label: "Draft ready", text: pitch.pitch, usedClaims: pitch.usedClaims || [] };
  }

  return {
    site,
    screenshotRelPath: scraper && scraper.screenshotPath ? scraper.screenshotPath : null,
    stages: { scrape: scrapeStage, critique: critiqueStage, verify: verifyStage, pitch: pitchStage },
  };
}

function getDashboardData(testSites) {
  const sites = testSites.sites.map(deriveSiteStatus);
  return {
    sites,
    summaries: {
      scraper: readStageSummary("scraper"),
      critique: readStageSummary("critique"),
      verifier: readStageSummary("verifier"),
      pitch: readStageSummary("pitch"),
    },
  };
}

module.exports = { getDashboardData };
