# MICRO1 HACKATHON

**Agentic Workflows — Project Proposal (Final, Phase 7)**

*Live Website Audit → Personalized Outreach Pitch Generator*

Submitted by BIT (Business Information Technology) · Abdul Rafay

> This is the final version of the proposal, with every `[to be filled]`
> placeholder from the original submission replaced by real, measured
> results from the completed pipeline. Full methodology and raw evidence:
> `data/runs/evaluation/EVALUATION.md`. Build history, including a real
> data-integrity bug found and fixed during final review: `PHASE_LOG.md`.

## 1. The Four Questions

**01 — Who has this problem?**

Freelancers and small agency owners who run cold outreach campaigns for
web design and development services — including BIT's own outreach
process, which targets local U.S. small businesses (smoke shops, salons,
clothing stores, boutiques) via WhatsApp, Instagram DM, and email using
a free-sample-design hook.

**02 — What bottleneck makes it worth solving?**

Every prospect's website has to be manually opened, reviewed for design
and performance issues, and then turned into a pitch that references
something specific about that business. Doing this properly takes
roughly 15–20 minutes per prospect. Under time pressure, most outreach
reverts to a generic template, and generic pitches get a visibly lower
response rate because the prospect can tell the message wasn't written
for them specifically.

Fact base: BIT currently sources leads from small business listings in
areas like Tyler, TX and Canton, OH, reviewing each one manually before
drafting outreach — a process that does not scale past a handful of
prospects per session.

**03 — Does the agent solve it well?**

A four-agent pipeline replaces the manual review-and-write process with
an automated, verified one:

- **Scraper Agent** — visits the target website, captures a screenshot,
  and pulls objective performance signals (page load time, mobile
  responsiveness, HTTPS/SSL status, last-updated indicators).
- **Critique Agent** — reviews the screenshot and performance data to
  identify concrete design and technical issues (outdated visual
  style, no mobile layout, slow load time, missing or weak
  call-to-action).
- **Verifier Agent** — cross-checks every claim the Critique Agent makes
  against the actual screenshot and performance data, and discards or
  flags any claim that isn't backed by evidence. This is the step
  that prevents hallucinated critiques from reaching a real prospect.
- **Pitch-Writer Agent** — takes only the verified issues and drafts a
  personalized WhatsApp/email/Instagram DM pitch referencing them
  specifically.

This directly matches the hackathon's guidance that context,
verification, and purposeful orchestration — not agent count — are
what should improve the outcome. **This held up in practice: the
Verifier rejected 2 of 28 real claims (7.1%), and a later manual review
caught a second, independent failure mode — stale run output surviving
a failed rerun — that no single agent was responsible for catching.
See the Hot Take (Section 7) for the full story.**

**Why memory and specialized skills were deliberately left out**

The hackathon brief notes that memory can carry information forward and
specialized skills can deepen an agent's ability at a particular task
— but also that purposeful choices matter more than the number of
components. Each prospect website in this workflow is evaluated
independently with no dependency on prior runs, so cross-run memory
would add complexity without improving the outcome. Likewise, the four
agents already have narrow, single-purpose roles (scrape, critique,
verify, write), so a separate "skill" layer was judged unnecessary for
this task's scope. If the project is later extended to track a prospect
across multiple outreach attempts (e.g. remembering what was already
pitched to avoid repetition), a lightweight memory store would be the
first addition.

**04 — Can another person reproduce the result?**

Yes. The submission includes:

- A fixed, documented list of 10 public small-business websites used
  for every test run (`data/test-sites.json`).
- Exact commands to run the baseline, the full agent pipeline, and the
  evaluation script from a clean environment (`REPRODUCTION.md`).
- Saved outputs for each run — screenshots, verifier logs (including
  rejected/flagged claims), and final generated pitches — under
  `data/runs/`, so a second reviewer can compare their own run's output
  against the submitted one without ambiguity.

## 2. Baseline & Evaluation

**Baseline (for fair comparison)**

A single direct prompt with no website data: "Write a cold outreach
pitch for [business name]." This mirrors the generic-template
approach used when time is short — no scraping, no verification, no
specific evidence. Both the baseline and the full pipeline were run
on the identical set of 10 websites so the comparison is fair.

**Primary metric**

Pitch specificity score — a 1–5 human rating of how accurately and
specifically the pitch reflects real, verifiable issues on the
prospect's actual website.

**Secondary metrics**

- Hallucination rate — percentage of Critique Agent claims rejected
  by the Verifier Agent.
- Time per pitch — baseline vs. full pipeline, measured end to end.

Evaluation ran on the same 10 websites for both the baseline and
the agent pipeline. The run surfaced two genuinely difficult cases on
its own — a Cloudflare bot-verification interstitial served instead of
a real homepage, and two sites whose scraper calls timed out — without
needing a deliberately engineered "hard" test case.

**Baseline vs. agent comparison (real, measured results)**

| Metric | Simple Baseline | Agent Solution | Change |
|---|---|---|---|
| Pitch specificity score (primary, 1–5) | **1.0 / 5** (8/10 sites scored) | **5.0 / 5** (6/6 sites scored) | **+4.0** |
| Hallucination rate (% claims rejected) | N/A — no verification step | **7.1%** (2/28 claims) | n/a (no baseline equivalent) |
| Human time per pitch | **17.0s** | **32.8s** | +15.7s (pipeline does more work per pitch: scrape + critique + verify + write, vs. baseline's single call) |
| Cost per pitch (API + compute) | $0.00 (Gemini free tier) | $0.00 (Gemini free tier) | no change (same free tier) |

**End-to-end coverage:** 8/10 sites succeeded at the baseline stage;
6/10 sites made it all the way through the full pipeline to a finished,
verified pitch. The comparison above uses only sites that reached a
finished pitch on both sides, for a fair like-for-like match. The 4
sites that didn't complete the pipeline are the two challenging cases
below (3 sites) plus one site the baseline itself failed on.

**Challenging cases (real, from the actual run)**

- **Shine Salon & Spa** (`site_04`) and **Apricot Lane Boutique**
  (`site_08`) — both failed at the Scraper stage with a 30-second
  `page.goto` timeout. Real small-business sites don't all load
  reliably for an automated browser; the pipeline skips these sites
  cleanly instead of producing output from partial or missing evidence.
- **OnlyClouds Smoke Shop** (`site_09`) — the Scraper Agent captured a
  Cloudflare bot-verification interstitial ("Performing security
  verification...") instead of the real homepage. Rather than critique
  the wrong page, the pipeline detects this pattern and skips the site
  entirely at the Critique stage.

## 3. Improvement Changelog

| Stage | What Was Tried and Why | Evidence | Decision / Learning |
|---|---|---|---|
| Baseline | Single direct prompt: "Write a cold outreach pitch for [business name]." No website data supplied. | 8/10 succeeded, avg 17.0s/pitch, **specificity 1.0/5** | Established the starting point — confirmed low specificity since the model has no real evidence to reference. Several outputs didn't even produce a pitch addressed to the business, defaulting to generic templates instead. |
| Iteration 1 — Scraper Agent | Added real evidence (screenshot, load time, SSL, mobile check) instead of guessing. | 8/10 sites scraped successfully | Kept — gives the Critique Agent something real to work from. |
| Iteration 2 — Critique Agent | Turned raw evidence into specific, human-readable issues. | 28 claims generated across 7 sites | Kept, but real-run review found two bugs (see fixes below) before the claims could be trusted. |
| Fix: bot-challenge detection | A real run showed a Cloudflare interstitial being critiqued as if it were the real homepage — every claim described the wrong page. | Added `possibleBotChallenge` flag on the Scraper Agent; Critique now skips flagged sites entirely | Kept — prevents confidently wrong claims about a page the prospect doesn't actually see. |
| Fix: date-hallucination guard | The Critique Agent called a footer year matching the current year "an incorrect future year" / "a misconfigured system clock" — the model has no reliable way to know today's real date. | Footer-year staleness is now computed in code from the real system date and handed to the model as a pre-decided fact, not a judgment call | Kept — moves a computable fact out of the model's hands entirely, rather than trying to prompt around the failure. |
| Iteration 3 — Verifier Agent | Cross-checked every Critique claim against the same screenshot/data; rejects unsupported claims by default (fails closed, not open). | **2/28 claims rejected — 7.1% hallucination rate** | Kept — this is the core hallucination-prevention step, and the rejection rate is in a healthy range (not ~0%, which would suggest rubber-stamping; not extremely high, which would suggest the Critique prompt needs tightening). |
| Iteration 4 — Pitch-Writer Agent | Restricted to only `verifiedClaims` — the raw Critique output and `rejectedClaims` are never even passed into its prompt, so there's nothing to accidentally leak. | 6/10 pitches generated, **specificity 5.0/5** | Identified as the single change that contributed most to the improvement: verified, specific claims → a personalized pitch a real business owner would recognize as genuinely about their site. |
| Final | Combined Scraper → Critique → Verifier → Pitch-Writer into the full pipeline, evaluated against baseline on the same 10 sites. | **Final specificity: 1.0 → 5.0 (+4.0). Final hallucination rate: 7.1%. Final time/pitch: 17.0s → 32.8s.** | The Verifier Agent is the single change that contributed most to trustworthiness (catching real hallucinations); the Pitch-Writer's hard isolation from rejected claims is what contributed most to the specificity jump, since it guarantees every claim reaching the prospect already survived independent re-checking. |

**Postscript, found during final packaging review (not part of any single
phase's own testing):** a rerun of the pitch script that hit the Gemini
free-tier daily quota left stale `.txt` output from earlier in the same
session sitting next to bookkeeping that said the site had failed —
including one file (`site_04`) that described issues for a site that had
**never** produced real evidence at any pipeline stage, traced to a
leftover test fixture. This was caught only by manually cross-referencing
every pitch's text against its own JSON record and the underlying Verifier
evidence, not by any existing script. Full writeup in
`data/runs/evaluation/EVALUATION.md`'s Hot Take postscript and
`PHASE_LOG.md`'s Phase 7 entry. **The added lesson: verification has to
extend to the filesystem, not just to the model's claims** — a pipeline
can get every in-flight check right and still ship something wrong if a
partial rerun failure leaves stale output sitting under a name that still
looks current.

## 4. Tech Stack

| Layer | Tool / Library | Purpose |
|---|---|---|
| Application framework | Next.js (App Router) + React | Powers both the agent orchestration (API routes / server actions) and the demo dashboard in a single codebase |
| Web scraping / capture | Playwright | Loads target site, captures screenshot, measures load time, checks mobile viewport rendering and SSL |
| LLM reasoning (Critique, Verifier, Pitch-Writer) | Google Gemini API (`gemini-2.5-flash` / `gemini-3.6-flash`, free tier) | Vision + text reasoning for critique, evidence-checking, and pitch drafting. *(Switched from the originally-planned Anthropic API early in Phase 0 — no Anthropic key was available at the time, and Gemini's free tier supports the vision input the Critique/Verifier agents need. See `PHASE_LOG.md`, Phase 0 update.)* |
| Data storage | Local JSON per run (screenshot path, perf metrics, critique claims, verifier verdicts, final pitch) | Keeps every run reproducible and auditable |
| Evaluation | `scripts/evaluate.js` + manual 1–5 rubric scoring | Runs baseline vs. pipeline on the same 10-site test set and logs results to a comparison table — makes no API calls, pure aggregation over saved run data |
| Frontend (demo) | Next.js + React + Tailwind (BIT's existing stack) | Dashboard to trigger a run and view scraped evidence next to the generated pitch |

## 5. Project Phases (all complete)

| Phase | Focus | Key Deliverable | Status |
|---|---|---|---|
| Phase 0 — Setup | Define test set: 10 real business websites. Set up Next.js repo, API keys, Playwright environment. | Reproducible project skeleton + fixed test set | ✅ |
| Phase 1 — Baseline | Run the generic single-prompt pitch generator on all 10 sites and score it. | Baseline results + starting specificity score (1.0/5) | ✅ |
| Phase 2 — Scraper Agent | Build Playwright capture: screenshot + load time + mobile check + SSL check. | Structured evidence file per site | ✅ |
| Phase 3 — Critique Agent | Feed scraped evidence to Gemini, generate a list of specific issues per site. | Raw critique list per site (28 claims, 7 sites) | ✅ |
| Phase 4 — Verifier Agent | Cross-check each critique claim against the evidence; reject unsupported claims. | Verified issue list + hallucination rate metric (7.1%) | ✅ |
| Phase 5 — Pitch-Writer | Generate the final outreach message using only verified issues. | Final personalized pitch per site (6/10 sites) | ✅ |
| Phase 6 — Evaluation | Score baseline vs. final pipeline on all 10 sites using the same rubric; build the comparison table. | Baseline vs. agent comparison (1.0 → 5.0) + changelog | ✅ |
| Phase 7 — Packaging | Write README, reproduction guide, record the solution video, export agent trajectories. | Final hackathon submission (4 deliverables) | ✅ |

## 6. Ground Rules Compliance

All ten ground rules from the hackathon brief, checked against this
project:

1. Built using tools and components already known — Next.js,
   Playwright, and the Gemini API are all part of BIT's existing stack
   (Gemini substituted for the originally-planned Claude API early on;
   see Section 4).
2. What existed before vs. what was added is stated explicitly:
   Next.js/Playwright/Gemini API are pre-existing tools; the Scraper,
   Critique, Verifier, and Pitch-Writer agent pipeline and its
   orchestration logic are what this project adds.
3. Every tool is used within its license and service terms —
   Playwright for scraping only publicly accessible pages (no bypassing
   paywalls or logins), and the Gemini API used per Google's usage
   policy.
4. The only consequential action in this workflow is sending an
   outreach message. The pipeline never sends anything automatically —
   it only produces a draft pitch, kept inside a sandboxed local run.
5. A qualified human reviewer (BIT / Abdul Rafay) reads and approves
   every generated pitch before it is sent to a real prospect — the
   agent's output is always a draft, never a final action.
6. The use case is legal and ethical: the pipeline only reads what
   is already publicly published on a business's own website, and produces
   a pitch offering a free sample service — the same practice BIT already
   runs manually.
7. Only public data is used — the 10 test websites are public
   small-business sites, and no private, scraped-behind-login, or personal
   data is collected.
8. Credentials stay out of the submission — the Gemini API key is
   read from a local `.env.local` file excluded from the repo via
   `.gitignore`; a `.env.example` with empty placeholders is provided
   instead.
9. Every claim in a final pitch is traceable to Verifier Agent
   evidence, and every metric in the evaluation table is traceable to a
   saved run log (screenshot, performance JSON, or verifier output)
   included in the submission. **This rule was tested for real during
   Phase 7 review** — two stale pitch files that would have violated it
   were caught and quarantined before submission; see Section 3's
   postscript.
10. Judges get everything needed to reproduce the main result: the
    fixed 10-site test list, exact run commands, saved evidence files, and
    the comparison table — all included per `REPRODUCTION.md`.

## 7. Hot Take / Insights

Working hypothesis going in (recorded before any run): the main failure
mode would be the Critique Agent stating a subjective, unfalsifiable
visual judgment (e.g. "outdated design") that the Verifier couldn't
confirm or reject the way it could an objective metric like load time or
SSL status.

**What actually happened was different, and arguably more useful.** The
real run's two production bugs weren't about subjective vs. objective
claims at all:

1. **A bot-verification page got critiqued as if it were the real site.**
   The Scraper Agent reported a Cloudflare "Performing security
   verification..." interstitial as a clean success, so every downstream
   claim described the wrong page entirely.
2. **The model misjudged today's date.** A footer year matching the
   current year got flagged as "an incorrect future year," because the
   model has no reliable way to know today's real-world date from its
   own reasoning.

Both were fixed the same way: **move the judgment out of the model's
hands into code** (a deterministic bot-phrase check; a pre-computed,
code-derived staleness verdict) rather than trying to prompt around
either failure.

**A third failure mode surfaced only during final packaging review, and
it's the most structurally interesting one:** stale run output from a
failed rerun sitting next to bookkeeping that said the site had failed,
including one file describing issues for a site that had never produced
real evidence at any stage. No single agent was responsible for this —
it was a gap in the *scripts'* rerun safety, not in any model's
reasoning, and it was only caught by manually cross-referencing every
pitch's text against its own JSON record and the Verifier's saved
evidence.

**Updated lesson:** verification in an agent pipeline has two different
jobs that are easy to conflate. One is checking whether the *model* is
telling the truth given what it was shown (the Verifier Agent's job,
and it works — 7.1% of real claims were caught). The other is checking
whether the *pipeline itself* is showing the model — and later, the
human reviewer — the right data in the first place. The second job
doesn't live in a prompt; it lives in how the scripts handle partial
failure. A pipeline can get every in-flight model check right and still
ship something wrong if a rerun's failure leaves old, plausible-looking
output behind under a name that no longer means what it used to.

## 8. Final Deliverables Checklist

- [x] Complete solution code + `README.md` (problem, user, bottleneck) +
      Improvement Changelog (Section 3 above, filled in with real results)
- [x] Reproduction guide — clean-environment setup, exact commands,
      expected output, runtime/cost estimate (`REPRODUCTION.md`)
- [ ] Solution video (≤5 min) — problem → baseline → full pipeline run →
      comparison → changelog highlight. **Script ready in
      `VIDEO_OUTLINE.md`; recording is the one remaining manual step.**
- [x] Agent trajectories — Scraper → Critique → Verifier → Pitch-Writer,
      with tool calls, retries, and evidence shown at each step
      (`TRAJECTORIES.md`)
