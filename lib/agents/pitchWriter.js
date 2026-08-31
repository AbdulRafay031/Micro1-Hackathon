/**
 * Pitch-Writer Agent — Phase 5 (IMPLEMENTED).
 *
 * Responsibility (per proposal Section 1, Q03):
 * Take ONLY the Verifier Agent's verified claims and draft a short,
 * personalized cold-outreach pitch referencing them specifically. Must
 * never use a claim the Verifier Agent rejected, and must never invent
 * an issue that isn't in the verified list.
 *
 * LLM: Google Gemini, text-only (lib/gemini.js -> generateText). No
 * screenshot needed at this step — the Verifier Agent already did the
 * evidence-checking; this agent's only job is to turn already-verified
 * facts into natural, persuasive prose.
 *
 * Design notes:
 * - The single most important design constraint in this agent: it is
 *   physically never shown rejectedClaims or the raw Critique Agent
 *   output — only verifierResult.verifiedClaims goes into the prompt.
 *   A model can't reference evidence it was never given.
 * - Even so, a model can still invent a *new* issue that sounds
 *   plausible but was never verified. To catch that, the model is
 *   required to echo which claim(s) it actually used by index (same
 *   index-matching pattern as the Verifier Agent), and this module
 *   validates those indices against the real verifiedClaims list before
 *   trusting them — an index that doesn't exist is dropped, not trusted.
 * - Tone: short, casual, personalized cold DM (per the proposal's
 *   Section 1 framing — WhatsApp/email/Instagram DM, not a formal audit
 *   report letter). References 2-3 of the strongest verified issues in
 *   natural language, not a bullet list, and ends with a low-pressure
 *   call to action rather than a hard sell.
 *
 * Input: the object returned by runVerifierAgent(), plus basic site info
 * ({ id, name, category, location, url }) from data/test-sites.json.
 * Output shape:
 * {
 *   siteId: string,
 *   pitch: string | null,
 *   usedClaims: string[],   // the verified issue strings actually referenced
 *   error: string | null
 * }
 */

const { generateText } = require("../gemini");

function buildPrompt(verifiedClaims, siteInfo) {
  const claimsList = verifiedClaims
    .map((c, i) => `${i + 1}. ${c.issue}`)
    .join("\n");

  return `You write short, friendly cold-outreach messages for BIT, a small studio that fixes small-business websites. You're messaging the owner of a real local business about their actual website — this is not a template, it needs to feel like someone genuinely looked at their site.

BUSINESS: ${siteInfo.name} (a ${siteInfo.category} in ${siteInfo.location})

VERIFIED, CONFIRMED ISSUES with their actual website (only these are true — nothing else about the site has been confirmed, so don't reference anything not on this list):
${claimsList}

Write a single short message (80-140 words) as if sending a friendly, low-pressure DM or email to the owner. Requirements:
1. Open by naturally mentioning you looked at their site — use the business name once, don't over-personalize into something stiff or corporate.
2. Reference 2-3 of the STRONGEST issues from the list above in natural conversational language — not a bullet list, not "issue #1, issue #2". Weave them into sentences a real person would write.
3. Do NOT invent, exaggerate, or reference any issue not in the list above.
4. Do NOT use generic filler that could apply to any business ("in today's digital age", "having a strong online presence is crucial").
5. End with one soft, specific call to action (e.g. offering a quick free mockup or a short call) — not pushy, no hard sell, no fake urgency.
6. Casual, warm tone — like a real person reaching out, not a marketing template.

Respond with ONLY raw JSON — no markdown code fences, no commentary. Exact shape:
{"pitch": "<the full message text>", "usedIndices": [<numbers from the list above that you actually referenced>]}`;
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

async function runPitchWriterAgent(verifierResult, siteInfo) {
  if (verifierResult.error || !verifierResult.verifiedClaims || verifierResult.verifiedClaims.length === 0) {
    return {
      siteId: verifierResult.siteId,
      pitch: null,
      usedClaims: [],
      error:
        verifierResult.error ||
        "No verified claims to pitch from — every claim was rejected, or none were generated.",
    };
  }

  const prompt = buildPrompt(verifierResult.verifiedClaims, siteInfo);

  let rawText;
  try {
    rawText = await generateText(prompt);
  } catch (err) {
    return {
      siteId: verifierResult.siteId,
      pitch: null,
      usedClaims: [],
      error: `Gemini call failed: ${err && err.message ? err.message : String(err)}`,
    };
  }

  let parsed;
  try {
    parsed = parseJsonResponse(rawText);
  } catch (err) {
    return {
      siteId: verifierResult.siteId,
      pitch: null,
      usedClaims: [],
      error: `Could not parse Gemini's response as JSON: ${err.message}`,
      rawResponse: rawText,
    };
  }

  if (!parsed || typeof parsed.pitch !== "string" || !parsed.pitch.trim()) {
    return {
      siteId: verifierResult.siteId,
      pitch: null,
      usedClaims: [],
      error: `Gemini's response JSON was missing a non-empty "pitch" string.`,
      rawResponse: rawText,
    };
  }

  // Validate usedIndices against the REAL verified claims list — an index
  // the model invents (out of range, wrong type) is dropped, not trusted.
  // This is the same enforcement pattern as the Verifier Agent: never take
  // the model's self-report about what it used at face value.
  const rawIndices = Array.isArray(parsed.usedIndices) ? parsed.usedIndices : [];
  const usedClaims = [];
  const seen = new Set();
  for (const idx of rawIndices) {
    const i = Number(idx) - 1;
    if (Number.isInteger(i) && i >= 0 && i < verifierResult.verifiedClaims.length && !seen.has(i)) {
      seen.add(i);
      usedClaims.push(verifierResult.verifiedClaims[i].issue);
    }
  }

  const result = {
    siteId: verifierResult.siteId,
    pitch: parsed.pitch.trim(),
    usedClaims,
    error: null,
  };

  if (usedClaims.length === 0) {
    result.warning =
      "Gemini didn't return any valid usedIndices — the pitch was generated from the verified claims list, but which specific claims it drew on couldn't be confirmed.";
  }

  return result;
}

module.exports = { runPitchWriterAgent, buildPrompt, parseJsonResponse };
