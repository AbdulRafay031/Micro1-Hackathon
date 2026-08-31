/**
 * Shared Gemini client — used by scripts/baseline.js (Phase 1) and, from
 * Phase 3 onward, by lib/agents/critique.js, verifier.js, pitchWriter.js.
 *
 * Uses the current official SDK, @google/genai (the older
 * @google/generative-ai package is deprecated by Google and must not be
 * used — see https://ai.google.dev/gemini-api/docs/migrate).
 */

const fs = require("fs");
const path = require("path");

// Load .env.local if present (recommended in the README), otherwise fall
// back to a plain .env file. Either works — this just picks whichever exists.
const rootDir = path.join(__dirname, "..");
const envLocalPath = path.join(rootDir, ".env.local");
const envPath = path.join(rootDir, ".env");
require("dotenv").config({
  path: fs.existsSync(envLocalPath) ? envLocalPath : envPath,
});

const { GoogleGenAI } = require("@google/genai");

// Gemini 2.5 Flash: stable (not a preview model), multimodal, and within
// Google AI Studio's free tier as of when this was written (Aug 2026).
// Override by setting GEMINI_MODEL in .env.local — e.g. to a newer 3.x
// Flash model, or to gemini-2.5-flash-lite for a cheaper/faster option.
const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";

let cachedClient = null;

function getClient() {
  if (cachedClient) return cachedClient;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing GEMINI_API_KEY. Copy .env.example to .env.local and paste " +
        "your key (free, no credit card required, at " +
        "https://aistudio.google.com/app/apikey)."
    );
  }

  cachedClient = new GoogleGenAI({ apiKey });
  return cachedClient;
}

/**
 * Text-only generation — used by the Phase 1 baseline and by the
 * Pitch-Writer Agent (Phase 5), which only needs the verified claims list,
 * not an image.
 */
async function generateText(prompt, modelName = DEFAULT_MODEL) {
  const ai = getClient();
  const response = await ai.models.generateContent({
    model: modelName,
    contents: prompt,
  });
  return response.text;
}

/**
 * Multimodal (image + text) generation — used from Phase 3 onward by the
 * Critique Agent (reads the desktop screenshot) and the Verifier Agent
 * (re-checks claims against the same screenshot).
 *
 * Reads the image from disk and sends it as inline base64 data alongside
 * the text prompt in a single user turn, per the current @google/genai
 * request shape (a Content object with a `parts` array — one text part,
 * one inlineData part). Images stay well under the API's 20MB inline
 * limit (a full-page PNG screenshot at these viewport sizes), so the
 * Files API upload path isn't needed here.
 */
async function generateVision(prompt, imagePath, modelName = DEFAULT_MODEL) {
  const ai = getClient();
  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString("base64");
  const mimeType = imagePath.toLowerCase().endsWith(".jpg") || imagePath.toLowerCase().endsWith(".jpeg")
    ? "image/jpeg"
    : "image/png";

  const response = await ai.models.generateContent({
    model: modelName,
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }, { inlineData: { mimeType, data: base64Image } }],
      },
    ],
  });
  return response.text;
}

module.exports = { getClient, generateText, generateVision, DEFAULT_MODEL };
