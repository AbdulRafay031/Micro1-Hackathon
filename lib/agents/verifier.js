/**
 * Verifier Agent — Phase 4 (IMPLEMENTED).
 *
 * Responsibility (per project proposal, Section 1, Q03):
 * Cross-check every claim the Critique Agent makes against the actual
 * screenshot and performance data. Discard or flag any claim that isn't
 * backed by evidence — this is the hallucination-prevention step that
 * keeps unverified critiques from reaching a real prospect.
 *
 * LLM: Google Gemini, multimodal (lib/gemini.js -> generateVision). The
 * SAME desktop screenshot the Critique Agent saw is sent again here,
 * alongside the full claims list — the Verifier Agent independently
 * re-examines the image rather than trusting the Critique Agent's own
 * description of what it found.
 *
 * Design notes:
 * - The prompt explicitly warns against rubber-stamping: a claim being
 *   phrased specifically and plausibly is not evidence it's true. The
 *   Verifier must locate the exact visual detail (or metric) itself
 *   before accepting a claim, per this project's Section 7 hypothesis
 *   that verification is only as strong as how falsifiable — and how
 *   independently re-checked — each claim actually is.
 * - Reuses the same describeLastUpdatedSignal() helper from critique.js
 *   so a footer-year claim is judged against the same pre-computed,
 *   code-derived staleness verdict — not left to the Verifier's own
 *   guess about today's date either. (This exact failure mode — a
 *   confidently wrong "future year" claim — showed up in a real Phase 3
 *   run before the fix; the Verifier must not reintroduce it.)
 * - Claims are matched back by a 1-based `index` the model is required to
 *   echo, not by re-matching issue text — text matching against
 *   possibly-reworded model output is fragile; an index is not.
 * - If the model drops a claim from its response, or returns something
 *   that isn't a clean accept/reject, that claim is rejected by default
 *   with a reason explaining why — silently keeping an unconfirmed claim
 *   would defeat the entire point of this agent.
 *
 * Input: the object returned by runCritiqueAgent(), plus the matching
 * scraperResult (for the screenshot path and metrics).
 * Output shape:
 * {
 *   siteId: string,
 *   verifiedClaims: [{ issue: string, evidence: string }],
 *   rejectedClaims: [{ issue: string, reason: string }],
 *   hallucinationRate: number | null,  // rejected / total claims; null if there were no claims to check
 *   error: string | null
 * }
 */

const fs = require("fs");
const path = require("path");
const { generateVision } = require("../gemini");
const { describeLastUpdatedSignal } = require("./critique");

const REPO_ROOT = path.join(__dirname, "..", "..");

function buildPrompt(critiqueResult, scraperResult) {
  const perfLines = [
    `- Page load time: ${scraperResult.loadTimeMs} ms`,
    `- Valid HTTPS/SSL: ${scraperResult.hasSsl}`,
    `- Mobile responsive (no horizontal overflow on a 390px-wide screen): ${scraperResult.isMobileResponsive}`,
    `- "Last updated" signal: ${describeLastUpdatedSignal(scraperResult)}`,
  ].join("\n");

  const claimsList = critiqueResult.claims
    .map((c, i) => `${i + 1}. ISSUE: ${c.issue}\n   BASED ON: ${c.basedOn}`)
    .join("\n\n");

  return `You are the verification step in a website-audit pipeline. Another AI (the Critique Agent) looked at this DESKTOP screenshot and these measured metrics, and produced the numbered claims below. Your job is to independently re-check each claim — NOT to assume it's correct because it sounds specific or plausible.

MEASURED METRICS:
${perfLines}

CLAIMS TO VERIFY:
${claimsList}

For EACH claim, look at the screenshot yourself (or check the metric value yourself) and decide:
- "accept" — you can independently locate the exact visual detail described, or the metric value stated matches the measured value above.
- "reject" — the visual detail isn't actually there, is different from how it's described, is a metric claim that doesn't match the measured value, or is too vague/subjective to check at all.

Hard rules:
1. Do not accept a claim just because its "BASED ON" text sounds specific — verify it actually matches what you see in the screenshot or the metric value above.
2. Do not independently judge whether a footer year is "old", "future", or "wrong" — the metrics section above already gives you the correct, pre-computed verdict on that. Trust it exactly.
3. Every rejection needs a concrete reason — what's actually different or missing, not just "unverifiable".
4. Every acceptance needs a concrete confirmation — restate the specific thing you located that confirms it, not just "confirmed".
5. You must return exactly one verdict per numbered claim above, in the same order, each carrying its original number as "index".

Respond with ONLY raw JSON — no markdown code fences, no commentary. Exact shape:
{"verdicts": [{"index": 1, "verdict": "accept", "note": "<what you located that confirms this, or what's wrong if rejecting>"}]}`;
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

async function runVerifierAgent(critiqueResult, scraperResult) {
  if (critiqueResult.error || !critiqueResult.claims || critiqueResult.claims.length === 0) {
    return {
      siteId: critiqueResult.siteId,
      verifiedClaims: [],
      rejectedClaims: [],
      hallucinationRate: null,
      error: critiqueResult.error || "No claims to verify — the Critique Agent produced an empty claims list.",
    };
  }

  if (!scraperResult || !scraperResult.screenshotPath) {
    return {
      siteId: critiqueResult.siteId,
      verifiedClaims: [],
      rejectedClaims: [],
      hallucinationRate: null,
      error: "No matching scraper evidence (screenshot) available to verify these claims against.",
    };
  }

  const screenshotAbsPath = path.join(REPO_ROOT, scraperResult.screenshotPath);
  if (!fs.existsSync(screenshotAbsPath)) {
    return {
      siteId: critiqueResult.siteId,
      verifiedClaims: [],
      rejectedClaims: [],
      hallucinationRate: null,
      error: `Screenshot file not found on disk at ${scraperResult.screenshotPath}.`,
    };
  }

  const prompt = buildPrompt(critiqueResult, scraperResult);

  let rawText;
  try {
    rawText = await generateVision(prompt, screenshotAbsPath);
  } catch (err) {
    return {
      siteId: critiqueResult.siteId,
      verifiedClaims: [],
      rejectedClaims: [],
      hallucinationRate: null,
      error: `Gemini vision call failed: ${err && err.message ? err.message : String(err)}`,
    };
  }

  let parsed;
  try {
    parsed = parseJsonResponse(rawText);
  } catch (err) {
    return {
      siteId: critiqueResult.siteId,
      verifiedClaims: [],
      rejectedClaims: [],
      hallucinationRate: null,
      error: `Could not parse Gemini's response as JSON: ${err.message}`,
      rawResponse: rawText,
    };
  }

  if (!parsed || !Array.isArray(parsed.verdicts)) {
    return {
      siteId: critiqueResult.siteId,
      verifiedClaims: [],
      rejectedClaims: [],
      hallucinationRate: null,
      error: `Gemini's response JSON was missing a "verdicts" array.`,
      rawResponse: rawText,
    };
  }

  const verifiedClaims = [];
  const rejectedClaims = [];

  critiqueResult.claims.forEach((claim, i) => {
    const verdict = parsed.verdicts.find((v) => v && v.index === i + 1);

    if (!verdict) {
      rejectedClaims.push({
        issue: claim.issue,
        reason: "Verifier Agent did not return a verdict for this claim — rejected by default.",
      });
      return;
    }

    if (verdict.verdict === "accept") {
      verifiedClaims.push({
        issue: claim.issue,
        evidence: verdict.note || claim.basedOn,
      });
    } else if (verdict.verdict === "reject") {
      rejectedClaims.push({
        issue: claim.issue,
        reason: verdict.note || "Rejected by Verifier Agent (no reason given).",
      });
    } else {
      rejectedClaims.push({
        issue: claim.issue,
        reason: `Verifier Agent returned an invalid verdict value ("${verdict.verdict}") — rejected by default.`,
      });
    }
  });

  const totalClaims = critiqueResult.claims.length;
  const hallucinationRate = totalClaims > 0 ? rejectedClaims.length / totalClaims : null;

  return {
    siteId: critiqueResult.siteId,
    verifiedClaims,
    rejectedClaims,
    hallucinationRate,
    error: null,
  };
}

module.exports = { runVerifierAgent, buildPrompt, parseJsonResponse };
