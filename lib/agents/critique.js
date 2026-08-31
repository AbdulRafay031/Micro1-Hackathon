/**
 * Critique Agent — Phase 3 (IMPLEMENTED).
 *
 * Responsibility (per project proposal, Section 1, Q03):
 * Take the Scraper Agent's evidence (desktop screenshot + performance
 * data) and identify concrete design/technical issues — outdated visual
 * style, no mobile layout, slow load time, missing or weak call-to-action.
 *
 * LLM: Google Gemini, multimodal (lib/gemini.js -> generateVision). The
 * desktop screenshot is sent as inline image data alongside the measured
 * performance numbers as text, in one call.
 *
 * Design notes (see also the proposal's Section 7 "Hot Take" hypothesis):
 * verification in Phase 4 is only as strong as how falsifiable each claim
 * is. So this agent's prompt deliberately forces every claim's `basedOn`
 * to point at something checkable — an exact visual detail visible in the
 * screenshot, or one of the four measured metrics — rather than an
 * open-ended aesthetic opinion like "looks outdated" with nothing to check
 * it against. The prompt also explicitly tells the model it was only given
 * the DESKTOP screenshot, so it can't claim to see the mobile layout
 * (that's the Scraper Agent's `isMobileResponsive` heuristic, not a visual
 * the Critique Agent has access to here).
 *
 * Input: the object returned by runScraperAgent() (Phase 2).
 * Output shape:
 * {
 *   siteId: string,
 *   claims: [{ issue: string, basedOn: string }],
 *   error: string | null,
 *   rawResponse?: string   // present only when JSON parsing failed, for debugging
 * }
 *
 * If the Scraper Agent's evidence itself failed (site didn't load, no
 * screenshot), this agent does not call Gemini at all — there is nothing
 * to critique — and returns an explanatory error instead.
 */

const fs = require("fs");
const path = require("path");
const { generateVision } = require("../gemini");

const REPO_ROOT = path.join(__dirname, "..", "..");

function describeLastUpdatedSignal(scraperResult) {
  const year = scraperResult.lastUpdatedSignal;
  if (!year) return "none found";

  const yearNum = parseInt(year, 10);
  const currentYear = new Date().getFullYear();
  const age = currentYear - yearNum;

  if (age >= 1) {
    return `${year} (this is ${age} year${age === 1 ? "" : "s"} old as of today — a genuinely stale signal, safe to flag)`;
  }
  // age <= 0: current year or (due to clock skew) one year ahead — either
  // way this is NOT evidence of staleness and must not be described as
  // wrong, future, or a misconfigured clock. The model has no reliable
  // independent way to know today's real date, so that judgment is made
  // here in code, not left to the model's guess.
  return `${year} (this matches the current year — this is NORMAL and NOT a stale or incorrect signal; do not flag it as an issue)`;
}

function buildPrompt(scraperResult) {
  const perfLines = [
    `- Page load time: ${scraperResult.loadTimeMs} ms`,
    `- Valid HTTPS/SSL: ${scraperResult.hasSsl}`,
    `- Mobile responsive (no horizontal overflow on a 390px-wide screen): ${scraperResult.isMobileResponsive}`,
    `- "Last updated" signal (weak — a year found in the page footer, usually just a copyright notice, NOT proof of a recent redesign): ${describeLastUpdatedSignal(
      scraperResult
    )}`,
  ].join("\n");

  return `You are a website auditor preparing evidence for a cold outreach pitch to a small local business. You will be shown a DESKTOP screenshot of their website's homepage plus these objective, already-measured metrics:

${perfLines}

Identify 3 to 6 concrete issues a prospect would recognize as real and specific to THEIR site (not generic advice that applies to any website). Every issue must be something a skeptical second reviewer could check and confirm just from the screenshot or the metrics above.

Hard rules:
1. Each issue's "basedOn" must name the EXACT evidence: either a specific, visible detail in the screenshot (e.g. "hero image is a stretched/pixelated stock photo", "primary nav has 9 items and wraps to two lines", "no visible call-to-action button above the fold") or one of the four metrics listed above, quoted with its value.
2. You were only given the DESKTOP screenshot. Do NOT make any claim about what the mobile layout looks like visually — you have no visual evidence of that. You MAY reference the isMobileResponsive metric value itself as a metric-based claim, but do not describe what the mobile page "looks like".
3. Do not invent metrics, dates, or facts that are not in the screenshot or the list above. You do not reliably know today's real-world date — the "last updated" line above already tells you, in parentheses, whether that year counts as stale or not. Trust that parenthetical exactly; never independently judge a year as "future", "incorrect", or "a misconfigured clock" yourself.
4. Avoid vague, unfalsifiable adjectives ("outdated", "unprofessional", "boring") unless immediately paired with the specific visual detail that makes it so.
5. Order issues from most pitch-worthy (clearest, most convincing to a prospect) to least.

Respond with ONLY raw JSON — no markdown code fences, no commentary before or after. Exact shape:
{"claims": [{"issue": "<short specific issue, one sentence>", "basedOn": "<exact screenshot detail or metric+value>"}]}`;
}

function parseJsonResponse(rawText) {
  let cleaned = rawText.trim();
  cleaned = cleaned
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/, "")
    .replace(/```\s*$/, "")
    .trim();
  return JSON.parse(cleaned);
}

async function runCritiqueAgent(scraperResult) {
  if (scraperResult.error || !scraperResult.screenshotPath) {
    return {
      siteId: scraperResult.siteId,
      claims: [],
      error: `Skipped — no usable evidence from the Scraper Agent (${
        scraperResult.error || "missing screenshot path"
      }).`,
    };
  }

  if (scraperResult.possibleBotChallenge) {
    return {
      siteId: scraperResult.siteId,
      claims: [],
      error:
        "Skipped — the Scraper Agent flagged this screenshot as a likely bot-verification interstitial (e.g. Cloudflare), not the site's real homepage. Critiquing it would produce claims about the wrong page.",
    };
  }

  const screenshotAbsPath = path.join(REPO_ROOT, scraperResult.screenshotPath);
  if (!fs.existsSync(screenshotAbsPath)) {
    return {
      siteId: scraperResult.siteId,
      claims: [],
      error: `Screenshot file not found on disk at ${scraperResult.screenshotPath} — did the scraper run get moved or cleaned up?`,
    };
  }

  const prompt = buildPrompt(scraperResult);

  let rawText;
  try {
    rawText = await generateVision(prompt, screenshotAbsPath);
  } catch (err) {
    return {
      siteId: scraperResult.siteId,
      claims: [],
      error: `Gemini vision call failed: ${err && err.message ? err.message : String(err)}`,
    };
  }

  let parsed;
  try {
    parsed = parseJsonResponse(rawText);
  } catch (err) {
    return {
      siteId: scraperResult.siteId,
      claims: [],
      error: `Could not parse Gemini's response as JSON: ${err.message}`,
      rawResponse: rawText,
    };
  }

  if (!parsed || !Array.isArray(parsed.claims)) {
    return {
      siteId: scraperResult.siteId,
      claims: [],
      error: `Gemini's response JSON was missing a "claims" array.`,
      rawResponse: rawText,
    };
  }

  return {
    siteId: scraperResult.siteId,
    claims: parsed.claims,
    error: null,
  };
}

module.exports = { runCritiqueAgent, buildPrompt, parseJsonResponse, describeLastUpdatedSignal };
