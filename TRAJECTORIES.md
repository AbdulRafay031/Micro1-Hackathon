# Agent Trajectories

Three real trajectories from the actual pipeline run, pulled directly from
`data/runs/`. Together they show: a clean end-to-end pass, a pass where the
Verifier genuinely rejects a hallucinated claim, and a pass where the
pipeline correctly stops early instead of producing wrong output. All tool
calls, evidence, and outputs below are real Gemini/Playwright output, not
illustrative examples.

---

## Trajectory 1 — Clean end-to-end pass

**Site:** KC Salon And Spa (`site_01`) — salon, Canton, OH —
`https://www.kcsalonandspacantonohio.com/`

### Step 1 — Scraper Agent (Playwright)

Tool calls: `chromium.launch()` → desktop context (1280×800) →
`page.goto(url)` → `response.securityDetails()` → `page.screenshot()` →
mobile context (390×844, iPhone UA) → second `page.goto()` + screenshot →
`scrollWidth` vs `clientWidth` check.

```json
{
  "loadTimeMs": 6418,
  "httpStatus": 200,
  "hasSsl": true,
  "isMobileResponsive": true,
  "lastUpdatedSignal": null,
  "possibleBotChallenge": false,
  "error": null,
  "stageTimeMs": 10960
}
```

Real load happened cleanly — no timeout, no bot-challenge flag, valid SSL.

### Step 2 — Critique Agent (Gemini vision)

Tool call: one multimodal Gemini call with the desktop screenshot + the
four metrics above.

```json
{
  "claims": [
    { "issue": "The entire main content area below the header displays as a solid black space with no headline, content, or imagery visible.", "basedOn": "solid black area filling the entire page body below the top navigation bar" },
    { "issue": "The website takes over 6.4 seconds to load, creating a significant delay for visitors.", "basedOn": "Page load time: 6418 ms" },
    { "issue": "The main conversion action 'Book With Us' is rendered as simple plain text rather than a visible call-to-action button.", "basedOn": "'Book With Us' link displayed in plain text alongside 'Home', 'Hair Extensions', and 'Contact' in the header navigation" },
    { "issue": "The website shows no footer copyright year or last updated signal.", "basedOn": "\"Last updated\" signal: none found" }
  ],
  "error": null,
  "stageTimeMs": 11584
}
```

Every claim's `basedOn` names an exact, checkable piece of evidence — no
open-ended aesthetic opinions.

### Step 3 — Verifier Agent (Gemini vision, independent re-check)

Tool call: a second, separate multimodal Gemini call — same screenshot,
plus the 4 numbered claims above — explicitly instructed that a
plausible-sounding claim is not itself evidence.

```json
{
  "verifiedClaims": [
    { "issue": "solid black content area...", "evidence": "The screenshot shows a solid black area completely filling the space beneath the top navigation bar with no headline, text, or visual content visible." },
    { "issue": "6.4 second load time...", "evidence": "The measured page load time of 6418 ms matches the claim of taking over 6.4 seconds to load." },
    { "issue": "'Book With Us' plain text...", "evidence": "'Book With Us' is displayed as plain inline navigation text alongside 'Home', 'Hair Extensions', and 'Contact' in the top header rather than as a styled CTA button." },
    { "issue": "no footer copyright/last-updated signal...", "evidence": "The measured metrics confirm that no 'Last updated' signal or copyright year was found on the page." }
  ],
  "rejectedClaims": [],
  "hallucinationRate": 0,
  "stageTimeMs": 10265
}
```

All 4 claims independently confirmed. 0% hallucination rate for this site.

### Step 4 — Pitch-Writer Agent (Gemini, text-only)

Tool call: one text-only Gemini call. Only `verifiedClaims` above — never
`rejectedClaims`, never the raw Critique output — enters this prompt.

**Output pitch (`data/runs/pitch/site_01.txt`):**

> Hi there! I was checking out KC Salon And Spa online today and noticed a
> couple of quick visual glitches on your website that might be confusing
> potential clients.
>
> When the site loads, the main area right below your header displays as
> a solid black space with no text or images visible. On top of taking
> over 6 seconds to load, your main 'Book With Us' link is currently
> plain text rather than a visible button.
>
> I run BIT, a small studio that helps local businesses fix site issues
> like these. Would you be open to me sending over a quick, free visual
> mockup of how that section could look fixed up? No pressure either way!

`usedClaims`: 3 of the 4 verified claims, all traceable back through
Verifier → Critique → the real screenshot and load-time measurement.

---

## Trajectory 2 — A genuine Verifier rejection

**Site:** Bombshell Hair Studio (`site_05`) — salon, Canton, OH —
`https://www.bombshellsaloncanton.com/`

### Critique Agent produced 4 claims, including:

```json
{ "issue": "The main hero heading 'Welcome to Bombshell Hair Studio' overlaps directly with the bright blonde hair background image, reducing text contrast and readability.", "basedOn": "hero text ... placed directly over the background image of light blonde hair" }
```

### Verifier Agent independently re-examined the same screenshot and rejected it:

```json
{ "issue": "The main hero heading ... overlaps ... blonde hair background image ...", "reason": "The main hero heading 'Welcome to Bombshell Hair Studio' is positioned on the left over a pale background gradient, not directly overlapping the blonde hair which is on the right side of the image." }
```

The other 3 claims (6+ second load time, two conflicting "Book an
Appointment" buttons, missing footer date) were confirmed and kept.
**`hallucinationRate: 0.25`** for this site — the Critique Agent got the
general shape of a real layout issue right (text near a busy background)
but misplaced exactly where, and the Verifier caught the specific error
rather than rubber-stamping a plausible-sounding claim.

The Pitch-Writer Agent never saw the rejected claim — it only received
the 3 confirmed ones, and the final pitch
(`data/runs/pitch/site_05.txt`) references only those.

---

## Trajectory 3 — Pipeline stops early instead of guessing

**Site:** OnlyClouds Smoke Shop (`site_09`) — smoke shop, Tyler, TX —
`https://www.onlycloudssmokeshop.com/`

### Step 1 — Scraper Agent

```json
{
  "loadTimeMs": 1321,
  "httpStatus": 403,
  "hasSsl": true,
  "isMobileResponsive": false,
  "possibleBotChallenge": true,
  "error": null
}
```

`httpStatus: 403` and `possibleBotChallenge: true` — the phrase-matching
check against the page title/body found a bot-verification interstitial
(Cloudflare-style "Performing security verification...") rather than the
real homepage. The Scraper Agent still returns a result (it didn't
technically fail to load *something*), but flags it as unreliable.

### Step 2 — Critique Agent

```json
{
  "claims": [],
  "error": "Skipped — the Scraper Agent flagged this screenshot as a likely bot-verification interstitial (e.g. Cloudflare), not the site's real homepage. Critiquing it would produce claims about the wrong page.",
  "stageTimeMs": 0
}
```

**No Gemini call was made.** The Critique Agent checks the
`possibleBotChallenge` flag before spending an API call, and skips
entirely rather than confidently describing a security-check page as if
it were the shop's real website.

### Steps 3-4 — Verifier and Pitch-Writer

Both agents receive the upstream error and pass it straight through
unchanged, calling no APIs — there's nothing to verify or pitch. This
site is correctly excluded from the final comparison rather than
producing a plausible-but-wrong pitch that would tell a real business
false things about their own homepage.

---

## What these three trajectories show together

- The **happy path** (Trajectory 1) works end to end with a 0%
  hallucination rate on that site, and every sentence in the final pitch
  traces back through three independent checks to a real, measured fact.
- The **Verifier genuinely does its job** (Trajectory 2) — it isn't a
  rubber stamp; it caught a real, specific inaccuracy in an otherwise
  plausible-sounding claim.
- The **pipeline fails safely** (Trajectory 3) — when the input evidence
  itself is untrustworthy, every downstream agent stops rather than
  compounding the error into a confident-sounding but wrong pitch.
