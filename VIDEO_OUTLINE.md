# Solution Video Outline (≤5 minutes)

Shot-by-shot script using the real numbers and real examples from this
submission. Timings are targets, not hard limits — trim narration, not
the on-screen evidence.

## 0:00–0:45 — Problem

**On screen:** slide/talking head. Optionally show a real BIT outreach
message being drafted manually.

**Say:** "BIT runs cold outreach for local small businesses — salons,
boutiques, smoke shops in Tyler, Texas and Canton, Ohio — offering a
free sample website redesign. Every prospect's site has to be manually
opened, reviewed, and turned into a pitch that references something
real about that specific business. Done properly, that's 15 to 20
minutes per prospect. Under time pressure, it collapses into a generic
template — and prospects can tell."

## 0:45–1:30 — Baseline

**On screen:** `npm run baseline` running, then open
`data/runs/baseline/site_06.txt` (Spinout Boutique — the funniest real
failure).

**Say:** "The baseline is the honest floor: one prompt, no website data
— 'write a cold outreach pitch for Spinout Boutique.' Watch what
happens: the model doesn't even know Spinout Boutique is a clothing
store. It assumes it's a corporate venture-studio firm and writes B2B
pitches about spinning out internal IP. Every baseline pitch scored 1
out of 5 on specificity — not because they're badly written, but
because none of them reference a single real thing about the actual
website."

## 1:30–3:15 — Full pipeline run

**On screen:** run `npm run scrape`, `critique`, `verify`, `pitch` in
sequence (can be sped up/cut between), showing terminal output for each.
Then open `data/runs/scraper/site_01.png` next to
`data/runs/pitch/site_01.txt`.

**Say (over the scraper):** "The Scraper Agent visits the real site with
Playwright — desktop and mobile — and captures a screenshot, load time,
SSL status, and mobile-responsiveness check. For KC Salon And Spa: 6.4
second load time, and the entire content area below the header is
rendering as a solid black block."

**Say (over critique → verifier):** "The Critique Agent turns that into
specific, checkable claims. The Verifier Agent then independently
re-examines the *same* screenshot and either confirms or rejects each
one — it's not allowed to just agree because a claim sounds plausible.
Across the real run, it rejected 2 of 28 claims — a 7.1% hallucination
rate. Here's one real rejection: the Critique Agent said hero text
overlapped a blonde-hair background image on Bombshell Hair Studio's
site. The Verifier looked again and found the text was actually
positioned over a plain background gradient, not the hair photo at all
— and threw the claim out."

**Say (over the pitch):** "Only claims that survive the Verifier ever
reach the Pitch-Writer — the rejected claim and the raw critique list
are never even in its prompt. Here's the real final pitch for KC Salon
And Spa, referencing the black content block, the load time, and the
plain-text booking link — all three independently confirmed."

*(Read the pitch on screen or aloud, briefly.)*

## 3:15–4:00 — Comparison

**On screen:** `data/runs/evaluation/EVALUATION.md`'s comparison table.

**Say:** "Same 10 sites, same rubric, scored blind to each other.
Specificity: 1.0 out of 5 for the baseline, 5.0 out of 5 for the full
pipeline — every claim in every pipeline pitch traced back to
independently confirmed evidence. It costs more time — 17 seconds per
pitch versus 33 — because it's doing four real steps instead of one
guess. Both run entirely on the Gemini free tier, so the cost is zero
either way."

## 4:00–4:45 — Changelog highlight + honesty beat

**On screen:** `PHASE_LOG.md`'s Phase 3 "Real-run findings + fixes"
section, and the Phase 7 postscript.

**Say:** "Two real bugs came out of running this against real sites, not
synthetic tests. One: a site served a Cloudflare bot-check page instead
of its real homepage, and the pipeline was about to critique the wrong
page entirely — fixed by detecting the pattern and skipping. Two: the
model called a normal current-year footer date 'an incorrect future
year' — because it has no reliable way to know today's date. Fixed by
computing that fact in code and handing it to the model as a decided
answer, not a question.

And a third one, found only during final review: a failed rerun left
old, plausible-looking pitch output sitting next to bookkeeping that
said the site had failed. One of those stale files described issues for
a site that had never produced real evidence at all. That's not a model
hallucination — it's a pipeline hygiene gap — and it's the reminder that
verification has to cover the filesystem, not just what the model
says."

## 4:45–5:00 — Close

**Say:** "Four agents, each with one job, each checked by the next one
in line — and still, the thing that almost slipped through wasn't a bad
model output. It was stale data. That's the actual lesson from building
this: purposeful orchestration beats agent count, but it only works if
verification covers the whole system, not just the model calls."

---

**Recording checklist:**
- [ ] Terminal font size large enough to read on a recording
- [ ] Have `data/runs/scraper/site_01.png`, `pitch/site_01.txt`,
      `evaluation/EVALUATION.md`, and `PHASE_LOG.md` pre-opened in tabs
- [ ] Do a dry run for timing — the script above targets ~4:45, leaving
      buffer under the 5-minute cap
