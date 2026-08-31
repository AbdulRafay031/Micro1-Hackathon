# Reproduction Guide

Everything needed to reproduce the main result from a clean environment:
**pitch specificity 1.0/5 (baseline) → 5.0/5 (agent pipeline)**, 7.1%
hallucination rate, 6/10 sites reaching a finished pitch end to end.

## Requirements

- Node.js 18.18+ and npm
- A free Google Gemini API key — https://aistudio.google.com/app/apikey
  (no credit card required; the project runs entirely on the free tier)
- ~150-300MB free disk space for Playwright's Chromium binary

## 1. Setup (~5 minutes)

```bash
# Unzip the project, then from its root:
npm install
npm run playwright:install       # downloads Chromium, one-time

cp .env.example .env.local
# open .env.local and paste your GEMINI_API_KEY
```

Sanity check: `npm run dev`, open `http://localhost:3000` — you should see
the dashboard listing all 10 test-set businesses.

## 2. Run the full pipeline

Run these **in order** — each stage reads the previous stage's saved
output rather than regenerating it:

```bash
npm run baseline    # ~3 min for 10 sites (single Gemini call each)
npm run scrape       # ~1-2 min for 10 sites (2 page loads each: desktop + mobile)
npm run critique     # ~2 min for sites with usable scraper evidence
npm run verify        # ~1 min for sites with claims to check
npm run pitch          # ~1 min for sites with verified claims
```

**Expected output per stage**, all under `data/runs/`:

| Command | Writes | What "success" looks like |
|---|---|---|
| `npm run baseline` | `baseline/<siteId>.json` + `.txt`, `_summary.json`, `SCORING.md` | 8-10/10 sites succeed (Gemini free-tier occasionally rejects a call under load — this is expected and handled per-site, not a crash) |
| `npm run scrape` | `scraper/<siteId>.json`, `.png`, `-mobile.png`, `_summary.json` | Most sites succeed; expect 1-2 real-world timeouts or bot-challenge flags — this is realistic small-business-website behavior, not a bug |
| `npm run critique` | `critique/<siteId>.json`, `_summary.json` | Runs for every site with usable scraper evidence; sites with a scraper error or a bot-challenge flag are skipped with a clear message, not a crash |
| `npm run verify` | `verifier/<siteId>.json`, `_summary.json` (includes `overallHallucinationRate`) | A healthy pipeline rejects a meaningful but not extreme fraction of claims — around 7% in the reference run, not ~0% (rubber-stamping) or very high (Critique prompt needs tightening) |
| `npm run pitch` | `pitch/<siteId>.json`, `.txt`, `_summary.json` | Only sites with ≥1 verified claim produce a pitch |

**Gemini free-tier rate limits:** each script waits ~4 seconds between
calls to stay under the per-minute limit, but the free tier also has a
**daily** request cap (20 requests/day on some models as of this
writing). If a script partway through a rerun starts failing every
remaining site with a `429 RESOURCE_EXHAUSTED` error, you've hit the
daily cap — wait until it resets (or switch to a fresh key) rather than
troubleshooting the code. **Known gap, not yet fixed in code:** the
pipeline scripts don't currently delete/rename their own output before a
rerun, so a failed rerun can leave an old successful `.txt` sitting next
to new failure bookkeeping. If you rerun a stage after hitting a rate
limit, spot-check that stage's `.json`/`.txt` pairs for the sites that
"succeeded" — this was caught and worked around manually during Phase 7
(see `PHASE_LOG.md` and `data/runs/pitch/_stale_excluded/README.md`).

## 3. Score specificity (manual step)

```bash
npm run evaluate
```

This is a **pure aggregation script — no API calls** — safe to run
repeatedly. First run creates `data/runs/pitch/SCORING.md` (mirroring
`data/runs/baseline/SCORING.md`'s format) and reports both specificity
scores as "not yet scored."

Read every `.txt` file in `data/runs/baseline/` and `data/runs/pitch/`
and fill in the **Specificity (1-5)** column in both `SCORING.md` files
by hand, using the rubric printed at the top of each file: *how
accurately and specifically the pitch reflects real, verifiable issues
on the business's actual website.* Score the pipeline pitches without
re-reading the baseline pitches first, for a fair comparison.

For a rigorous score (not a skim), cross-check each pitch's stated
issues against that site's `data/runs/verifier/<siteId>.json` →
`verifiedClaims` — a pitch only deserves a high score if what it says
is actually what the Verifier confirmed, not just plausible-sounding.

## 4. Get final numbers

```bash
npm run evaluate
```

Run again after scoring — this produces the final
`data/runs/evaluation/EVALUATION.md` (the comparison table, real
Improvement Changelog, and challenging-case writeup) and
`_summary.json` (same numbers, machine-readable).

## 5. View the dashboard (optional)

```bash
npm run dev
```

`http://localhost:3000` reads directly from `data/runs/` — a pipeline
trail per site (Scrape → Critique → Verify → Pitch), color-coded by
status, expandable to the real screenshot, claims, and verifier
reasoning.

## Runtime & cost estimate (10-site test set)

- **Total wall-clock time:** roughly 8-12 minutes across all 5 pipeline
  commands, plus however long manual scoring takes.
- **Cost:** $0.00 — everything runs on the Gemini free tier. The only
  constraint is the daily request cap noted above.

## Fixed test set

`data/test-sites.json` — do not change this list after `npm run
baseline` has run once, for a fair comparison. It contains 10 real,
public small-business websites (salons, boutiques, a clothing store, a
smoke shop) in Tyler, TX and Canton, OH.
