/**
 * Scraper Agent — Phase 2 (IMPLEMENTED).
 *
 * Responsibility (per project proposal, Section 1, Q03):
 * Visit a target website with Playwright, capture a screenshot, and pull
 * objective performance signals: page load time, mobile responsiveness,
 * HTTPS/SSL status, and a last-updated indicator.
 *
 * Design notes:
 * - Desktop and mobile are loaded in SEPARATE browser contexts so the
 *   viewport/user-agent from one pass can't leak into the other.
 * - SSL is checked via Playwright's response.securityDetails() rather than
 *   just "does the URL start with https://" — a site can be served over
 *   https:// with an invalid/expired cert, which securityDetails() catches
 *   and a URL-prefix check would miss.
 * - Mobile responsiveness is a heuristic (scrollWidth vs. clientWidth —
 *   if the page content is wider than the mobile viewport, there's
 *   horizontal overflow, which is a strong sign the layout isn't
 *   responsive). This is deliberately simple and explainable, which
 *   matters for the Verifier Agent (Phase 4) that has to cross-check
 *   Critique Agent claims against this same evidence.
 * - The "last-updated" signal is best-effort only (looks for a 4-digit
 *   year in the page footer, commonly a copyright notice). It's a weak
 *   signal, not proof — documented as such so the Critique Agent doesn't
 *   overstate it.
 * - Bot-challenge detection (added after a real Phase 3 run surfaced it):
 *   some sites serve a Cloudflare/anti-bot interstitial instead of the
 *   real homepage to an automated browser. Without a check for this, the
 *   scraper reports a clean success — real load time, a screenshot, an
 *   SSL check — for a page that isn't the prospect's actual site, and
 *   every downstream agent unknowingly treats that interstitial as
 *   ground truth. `possibleBotChallenge` flags this via a literal phrase
 *   match against the page title/body (Cloudflare's "Performing security
 *   verification", "Just a moment...", etc.) — same deliberately-simple,
 *   explainable style as the mobile-overflow check.
 *
 * Output shape:
 * {
 *   siteId, url, screenshotPath, mobileScreenshotPath,
 *   loadTimeMs, httpStatus, hasSsl, isMobileResponsive,
 *   lastUpdatedSignal, possibleBotChallenge, capturedAt, error
 * }
 * On failure, all evidence fields are null and `error` holds the message —
 * callers should check `error` before trusting the rest of the object.
 */

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const config = require("../../playwright.config");

const REPO_ROOT = path.join(__dirname, "..", "..");
const SCREENSHOT_DIR = path.join(REPO_ROOT, "data", "runs", "scraper");

const DESKTOP_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const MOBILE_USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const MOBILE_VIEWPORT = { width: 390, height: 844 };

async function checkHasSsl(url, response) {
  if (!url.startsWith("https://") || !response) return false;
  try {
    const details = await response.securityDetails();
    return details !== null;
  } catch (err) {
    return false;
  }
}

async function findLastUpdatedSignal(page) {
  // Best-effort only — see design notes above. Never throws; returns null
  // if no footer exists or no year-like string is found.
  try {
    const footerText = await page
      .locator("footer")
      .first()
      .innerText({ timeout: 3000 });
    const match = footerText.match(/\b(20[1-2][0-9])\b/);
    return match ? match[1] : null;
  } catch (err) {
    return null;
  }
}

async function checkMobileResponsive(page) {
  try {
    return await page.evaluate(() => {
      return (
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth + 5
      );
    });
  } catch (err) {
    return null;
  }
}

// Known bot-verification / anti-scraping interstitial phrases. If one of
// these is what actually got captured, the screenshot and every metric
// derived from it describe the *interstitial*, not the real site — a
// scraper "success" here would silently feed false evidence to every
// downstream agent. Deliberately a small, literal phrase list (not a
// general classifier) so it stays explainable and low false-positive,
// matching this project's other heuristics (mobile-overflow, footer-year).
const BOT_CHALLENGE_PHRASES = [
  "performing security verification",
  "checking your browser before accessing",
  "verify you are human",
  "attention required! | cloudflare",
  "just a moment...",
  "access denied",
  "please verify you are a human",
];

async function detectBotChallenge(page) {
  try {
    const [title, bodyText] = await Promise.all([
      page.title(),
      page.evaluate(() => document.body ? document.body.innerText.slice(0, 2000) : ""),
    ]);
    const haystack = `${title} ${bodyText}`.toLowerCase();
    return BOT_CHALLENGE_PHRASES.some((phrase) => haystack.includes(phrase));
  } catch (err) {
    return false;
  }
}

function emptyEvidence(site, errorMessage) {
  return {
    siteId: site.id,
    url: site.url,
    screenshotPath: null,
    mobileScreenshotPath: null,
    loadTimeMs: null,
    httpStatus: null,
    hasSsl: null,
    isMobileResponsive: null,
    lastUpdatedSignal: null,
    possibleBotChallenge: null,
    capturedAt: new Date().toISOString(),
    error: errorMessage,
  };
}

async function runScraperAgent(site) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const screenshotPath = path.join(SCREENSHOT_DIR, `${site.id}.png`);
  const mobileScreenshotPath = path.join(
    SCREENSHOT_DIR,
    `${site.id}-mobile.png`
  );

  let browser;
  try {
    browser = await chromium.launch({ headless: config.use.headless });
  } catch (err) {
    return emptyEvidence(
      site,
      `Failed to launch Chromium — did you run "npm run playwright:install"? (${
        err && err.message ? err.message : err
      })`
    );
  }

  try {
    // --- Desktop pass: load time, SSL, screenshot, last-updated signal ---
    const desktopContext = await browser.newContext({
      viewport: config.use.viewport,
      userAgent: DESKTOP_USER_AGENT,
    });
    const desktopPage = await desktopContext.newPage();

    const startedAt = Date.now();
    const response = await desktopPage.goto(site.url, {
      waitUntil: "load",
      timeout: config.timeout,
    });
    const loadTimeMs = Date.now() - startedAt;

    const hasSsl = await checkHasSsl(site.url, response);
    const lastUpdatedSignal = await findLastUpdatedSignal(desktopPage);
    const httpStatus = response ? response.status() : null;
    const possibleBotChallenge = await detectBotChallenge(desktopPage);

    await desktopPage.screenshot({ path: screenshotPath });
    await desktopContext.close();

    // --- Mobile pass: separate context ---
    const mobileContext = await browser.newContext({
      viewport: MOBILE_VIEWPORT,
      isMobile: true,
      hasTouch: true,
      userAgent: MOBILE_USER_AGENT,
    });
    const mobilePage = await mobileContext.newPage();
    await mobilePage.goto(site.url, {
      waitUntil: "load",
      timeout: config.timeout,
    });
    await mobilePage.screenshot({ path: mobileScreenshotPath });
    const isMobileResponsive = await checkMobileResponsive(mobilePage);
    await mobileContext.close();

    return {
      siteId: site.id,
      url: site.url,
      screenshotPath: path.relative(REPO_ROOT, screenshotPath),
      mobileScreenshotPath: path.relative(REPO_ROOT, mobileScreenshotPath),
      loadTimeMs,
      httpStatus,
      hasSsl,
      isMobileResponsive,
      lastUpdatedSignal,
      possibleBotChallenge,
      capturedAt: new Date().toISOString(),
      error: null,
    };
  } catch (err) {
    return emptyEvidence(site, err && err.message ? err.message : String(err));
  } finally {
    await browser.close();
  }
}

module.exports = { runScraperAgent };
