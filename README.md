# BIT — Website Audit → Personalized Outreach Pitch Generator

**micro1 Agentic Workflows Hackathon submission**

## Status

All phases (0–7) complete. The full agent pipeline runs end to end on the
fixed 10-site test set, has been evaluated against the baseline with real
scored numbers, and is packaged for submission. Headline result:
**pitch specificity 1.0/5 (baseline) → 5.0/5 (agent pipeline), +4.0**, with
a 7.1% hallucination rate (2/28 Critique Agent claims rejected by the
Verifier) and 6/10 sites reaching a finished, verified pitch end to end.
Full numbers and methodology: `data/runs/evaluation/EVALUATION.md`.
Submission package: `PROJECT_PROPOSAL.md`, `REPRODUCTION.md`,
`TRAJECTORIES.md`, `VIDEO_OUTLINE.md`. Full phase-by-phase build history,
including a real data-integrity bug found and fixed during final review:
`PHASE_LOG.md`.

## Who has this problem / what's the bottleneck

Freelancers and small agency owners — including BIT's own outreach process —
manually review a prospect's website before writing a cold pitch. Doing this
properly takes 15–20 minutes per prospect, so most outreach reverts to a
generic template, which gets a visibly lower response rate. Full detail in
the project proposal document (Section 1, Q01–Q02).

## Architecture

Four-agent pipeline: **Scraper → Critique → Verifier → Pitch-Writer**.
Full rationale in the project proposal (Section 1, Q03).

- `lib/agents/scraper.js` — Playwright: screenshot + load time + mobile + SSL *(Phase 2)*
- `lib/agents/critique.js` — Gemini (vision): turns evidence into specific issues *(Phase 3)*
- `lib/agents/verifier.js` — Gemini (vision): rejects issues not backed by evidence *(Phase 4)*
- `lib/agents/pitchWriter.js` — Gemini (text): drafts the pitch from verified issues only *(Phase 5)*

## Setup (clean environment)

Requires Node.js 18.18+ and npm.

```bash
# 1. Install dependencies
npm install

# 2. Install Playwright's browser binary (used by the Scraper Agent from Phase 2 onward)
npm run playwright:install

# 3. Set your API key
cp .env.example .env.local
# then open .env.local and paste your GEMINI_API_KEY
# (free, no credit card — get one at https://aistudio.google.com/app/apikey)

# 4. Run the dashboard (optional, for viewing progress)
npm run dev
# open http://localhost:3000
```

## Fixed test set

`data/test-sites.json` — 10 real, public small-business websites (salons,
boutiques, a clothing store, a smoke shop) in Tyler, TX and Canton, OH,
matching BIT's actual outreach target profile. This exact list is used for
the baseline, the full pipeline, and the evaluation — do not change it after
Phase 1 runs, for a fair comparison.

## Commands (filled in as each phase is implemented)

| Command | Status | Does |
|---|---|---|
| `npm run baseline` | ✅ implemented (Phase 1) | Calls Gemini with the bare prompt "Write a cold outreach pitch for [business name]" for all 10 test sites — no scraping, no evidence. Saves results to `data/runs/baseline/`. |
| `npm run scrape` | ✅ implemented (Phase 2) | Runs the Scraper Agent (Playwright) on all 10 test sites — screenshot, load time, SSL check, mobile-responsiveness check, last-updated signal. Saves evidence to `data/runs/scraper/`. |
| `npm run critique` | ✅ implemented (Phase 3) | Runs the Critique Agent (Gemini vision) on each site's saved scraper evidence — reads the desktop screenshot + performance data, outputs 3–6 evidence-tied issues per site. Requires `npm run scrape` to have been run first. Saves claims to `data/runs/critique/`. |
| `npm run verify` | ✅ implemented (Phase 4) | Runs the Verifier Agent (Gemini vision) on each site's saved Critique claims — independently re-examines the same screenshot for each claim, splits into `verifiedClaims`/`rejectedClaims`, computes a per-site and overall hallucination rate. Requires `npm run critique` to have been run first. Saves results to `data/runs/verifier/`. |
| `npm run pitch` | ✅ implemented (Phase 5) | Runs the Pitch-Writer Agent (Gemini text) on each site's saved Verifier output — drafts a short, personalized cold-outreach message using ONLY `verifiedClaims`, never rejected or raw critique claims. Requires `npm run verify` to have been run first. Saves drafts to `data/runs/pitch/`. |
| `npm run evaluate` | ✅ implemented (Phase 6) | Compares the Phase 1 baseline against the full pipeline — no API calls, just reads what every earlier phase already saved. Requires all 5 previous `npm run` commands to have been run first. Produces `data/runs/evaluation/EVALUATION.md`. |

### Running the baseline

```bash
npm run baseline
```

This loops over all 10 sites in `data/test-sites.json`, waits ~4 seconds
between calls (to stay under the Gemini free-tier rate limit), and writes:

- `data/runs/baseline/<siteId>.json` — full record (prompt, pitch text, timing, any error)
- `data/runs/baseline/<siteId>.txt` — just the pitch text, easy to read
- `data/runs/baseline/_summary.json` — run stats (success/fail count, average time)
- `data/runs/baseline/SCORING.md` — a table to manually score each pitch's specificity (1–5), per the evaluation method in the project proposal (Section 2)

If a call fails (e.g. a rate limit), that site's `.json` records the error
and the run continues with the rest — it won't stop the whole batch. Delete
that one `.json` file and re-run the script to retry just the failures, or
wait a minute and re-run everything.

### Running the scraper

```bash
npm run scrape
```

Requires the Chromium binary — run `npm run playwright:install` first if
you haven't already (only needed once). For each of the 10 sites, this:

- Loads the site in a desktop viewport, records load time, HTTP status,
  and SSL validity (via Playwright's `securityDetails()`, not just a
  `https://` prefix check — this catches an invalid/expired cert on an
  https URL)
- Takes a desktop screenshot
- Loads the site again in a separate mobile-viewport context (iPhone-sized,
  touch-enabled) and takes a mobile screenshot
- Flags whether the page overflows the mobile viewport horizontally — a
  practical signal that the layout isn't responsive
- Makes a best-effort attempt to read a year out of the page footer (a
  weak, not authoritative, "last updated" signal — usually just a
  copyright notice)

Output per site: `data/runs/scraper/<siteId>.json` (all evidence) plus
`<siteId>.png` and `<siteId>-mobile.png` (screenshots). `_summary.json`
has the run-level pass/fail counts. If a site fails to load (DNS error,
timeout, or Chromium not installed), that site's evidence fields are all
`null` and `error` explains why — the run continues with the rest.

A real Phase 3 run surfaced a case a plain load/timeout check doesn't
catch: a site can load "successfully" but actually serve a bot-check
interstitial (e.g. Cloudflare's "Performing security verification") to
an automated browser instead of its real homepage. `possibleBotChallenge`
flags this via a phrase match against the page title/body, so downstream
agents know not to trust that evidence as the real site.

### Running the critique agent

```bash
npm run critique
```

Requires `npm run scrape` to have already been run — this reads its saved
output from `data/runs/scraper/` rather than re-scraping. For each site
with usable evidence, it sends the desktop screenshot plus the four
measured metrics (load time, SSL, mobile-responsive flag, footer-year
signal) to Gemini in one multimodal call, and asks for 3–6 issues, each
tied to a specific, checkable piece of evidence — not a vague opinion.

The prompt deliberately forbids two things: inventing evidence that isn't
in the screenshot or metrics, and describing what the mobile layout
"looks like" (the agent is only shown the desktop screenshot — mobile
responsiveness is a metric it can cite, not something it can see).

Output per site: `data/runs/critique/<siteId>.json` —
`{ siteId, claims: [{ issue, basedOn }], error }`. If a site's scraper
evidence had an error (site didn't load), that site is skipped here
without calling Gemini, and the error is carried forward so it's visible
in the summary instead of silently disappearing. Same skip behavior
applies if the Scraper Agent flagged `possibleBotChallenge` — critiquing
a bot-verification page instead of the real site would just produce
confidently wrong claims. `_summary.json` has run-level counts, including
total claims generated — this feeds the Phase 6 hallucination-rate metric
once the Verifier Agent (Phase 4) can say how many of these claims
actually hold up.

One more thing worth knowing: this agent is never asked to judge whether
a footer year is "old" or "wrong" on its own — the model has no reliable
way to know today's real date from its own reasoning, and asking it to
guess produced a real false claim in testing ("incorrect future year" on
a footer that just said the current year). The actual staleness check is
computed in code from the real system date and handed to the model as an
already-decided verdict, so this can't drift back into a hallucination
later.

### Running the verifier agent

```bash
npm run verify
```

Requires `npm run critique` to have already been run — this reads its
saved claims from `data/runs/critique/` (plus the matching scraper
evidence from `data/runs/scraper/`) rather than regenerating anything.
For each site with claims to check, it sends the **same** desktop
screenshot the Critique Agent saw, together with the full numbered list
of that site's claims, back to Gemini — and asks it to independently
locate the exact evidence for each one before accepting it.

This is deliberately not a rubber stamp. The prompt explicitly says a
claim being phrased specifically and plausibly is not itself evidence
it's true — the Verifier has to point at the same visual detail (or
metric) itself. It also reuses the exact same pre-computed footer-year
verdict the Critique Agent uses, so a "the year looks wrong" hallucination
can't sneak back in through this agent instead.

Output per site: `data/runs/verifier/<siteId>.json` —
```json
{
  "siteId": "...",
  "verifiedClaims": [{ "issue": "...", "evidence": "..." }],
  "rejectedClaims": [{ "issue": "...", "reason": "..." }],
  "hallucinationRate": 0.33,
  "error": null
}
```
`hallucinationRate` is `rejectedClaims.length / totalClaims` for that
site (`null` if there were no claims to check — e.g. the site was
skipped upstream). Sites the Critique Agent itself skipped (scraper
error, bot-challenge interstitial) pass straight through here with their
original error and no Gemini call — there's nothing to verify.

`_summary.json` has the run-level totals plus an overall
`overallHallucinationRate` across every claim from every site — this is
the actual number the project proposal's Phase 6 evaluation is built
around, so it's worth watching once you run this for real: a healthy
pipeline should reject a meaningful chunk of claims (proving the Verifier
is actually checking, not agreeing), but not so many that the Critique
Agent's prompt clearly needs tightening instead.

If a verdict comes back malformed, missing, or with an unrecognized
value, that claim is rejected by default with an explanatory reason
rather than silently counted as accepted — an unconfirmed claim slipping
through is a worse failure mode here than an over-cautious rejection.

### Running the pitch-writer agent

```bash
npm run pitch
```

Requires `npm run verify` to have already been run — this reads
`data/runs/verifier/`, and only ever passes `verifiedClaims` into the
prompt. `rejectedClaims` and the raw Critique Agent output are never
given to this agent at all — not filtered out by instruction, just never
in its context — so it can't reference evidence that didn't hold up,
even by accident.

The model is also required to report which claim(s) (by number) it
actually used in the pitch. Those numbers are checked against the real
verified-claims list before being trusted: an invented or out-of-range
number is dropped, not recorded. If the model doesn't return any usable
numbers at all, the pitch is still kept (rejecting a possibly-fine pitch
over bookkeeping would be its own failure mode) but flagged with a
`warning` so it's visible in `_summary.json` rather than silently assumed
fine.

Output per site: `data/runs/pitch/<siteId>.json` —
`{ siteId, pitch, usedClaims: string[], error, warning? }`, plus a plain
`<siteId>.txt` with just the pitch text for quick reading. Sites with no
verified claims to work from (rejected everything, or were skipped
further upstream) are skipped here too, with the error carried forward —
there's nothing true and confirmed left to write a pitch from.

This is the last step of the core agent pipeline. `npm run baseline`
(Phase 1) already produced the "before" comparison — the same 10 sites,
pitched with zero site-specific evidence. Phase 6 is reading both sets
side by side.

### Running the evaluation

```bash
npm run evaluate
```

Requires all 5 previous phases to have been run at least once — checks
for each stage's `_summary.json` and tells you exactly which `npm run`
command is missing if not. **Makes no API calls** — it only reads what
every earlier phase already saved to `data/runs/`, so it's safe to re-run
freely.

What it does:
- Compares baseline vs. the full pipeline using only the sites that made
  it all the way to a finished pitch (a fair like-for-like set)
- Computes the real hallucination rate from `data/runs/verifier/`
  automatically
- Sums each site's per-stage `stageTimeMs` (scrape + critique + verify +
  pitch — each runner script now records this) for the "human time per
  pitch" comparison against baseline's single-call time
- **Creates `data/runs/pitch/SCORING.md`** — same rubric and format as
  the baseline's, but only if it doesn't already exist, so it never
  clobbers scores you've already entered
- Writes `data/runs/evaluation/EVALUATION.md`: the full comparison table,
  a real Improvement Changelog built from actual measured numbers (not
  the proposal doc's placeholders), a write-up of whichever real failure
  the run surfaced as the "challenging case," and an updated Hot Take
- Writes `data/runs/evaluation/_summary.json` — same numbers, machine-readable

Run it once before scoring (to generate `pitch/SCORING.md`), fill in both
SCORING.md files by hand, then run it again for final numbers — the
report clearly flags anything still pending either way.

## Dashboard

```bash
npm run dev
```

Then open `http://localhost:3000`. This reads directly from `data/runs/`
on disk — it's not a separate mock UI, it's whatever your last
`npm run scrape` / `critique` / `verify` / `pitch` actually produced. No
pipeline run yet? The dashboard says so and tells you which command to
run first, rather than showing fake data.

Each site is a "pipeline trail" — Scrape → Critique → Verify → Pitch —
color-coded per stage (green = succeeded, amber hollow = skipped, amber
filled = warning like a bot-challenge capture, red = failed, gray = not
reached yet). Expand a site to see its actual desktop screenshot, the
Critique Agent's raw claims, the Verifier's accept/reject decision with
its reasoning for each one, and — once `npm run pitch` has been run —
the actual drafted outreach message.

This intentionally shows whatever's really on disk, including stale or
buggy runs from before a fix — e.g. if you haven't re-run `scrape` +
`critique` since the bot-challenge/date fixes described below, a site
like `site_09` will still show its old (incorrect) claims here. That's
expected: the dashboard is a mirror of `data/runs/`, not a second source
of truth, so re-running the pipeline is what updates it.

## Data & outputs

Each run's evidence (screenshot, performance JSON, critique claims, verifier
verdicts, final pitch) is saved under `data/runs/`. This folder is
gitignored during development to keep the repo light; before final
submission, the curated run outputs required for reproducibility (Ground
Rule 10) will be force-added so judges can inspect them without re-running
the pipeline themselves.

## Improvement Changelog

See the project proposal document, Section 3. Will be moved into this
README (or kept as a linked file) with real, measured values once Phases
1–6 are executed.

## License note

Every third-party tool here (Next.js, Playwright, Gemini API) is used
within its own license/usage terms — see Ground Rules Compliance in the
project proposal, Section 6.
