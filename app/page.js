import testSites from "@/data/test-sites.json";
import { getDashboardData } from "@/lib/runData";

const STAGE_ORDER = ["scrape", "critique", "verify", "pitch"];
const STAGE_TITLES = { scrape: "Scrape", critique: "Critique", verify: "Verify", pitch: "Pitch" };

function Trail({ stages }) {
  return (
    <div className="trail">
      {STAGE_ORDER.map((key, i) => {
        const s = stages[key];
        return (
          <div key={key} style={{ display: "flex", alignItems: "center" }}>
            <div className="trail-node">
              <span className={`trail-dot state-${s.state}`} />
              <span className="trail-label">
                <span className="stage-name">{STAGE_TITLES[key]}</span>
                {s.label}
              </span>
            </div>
            {i < STAGE_ORDER.length - 1 && <div className="trail-connector" />}
          </div>
        );
      })}
    </div>
  );
}

function SummaryStrip({ summaries }) {
  const scraper = summaries.scraper;
  const critique = summaries.critique;
  const verifier = summaries.verifier;

  if (!scraper && !critique && !verifier) {
    return (
      <div className="skip-note" style={{ marginBottom: 28 }}>
        No pipeline runs found yet under <code>data/runs/</code>. Run <code>npm run scrape</code>,
        then <code>npm run critique</code>, then <code>npm run verify</code> to populate this dashboard.
      </div>
    );
  }

  return (
    <div className="summary-strip">
      {scraper && (
        <div className="summary-stat">
          <div className="value mono">{scraper.successCount ?? scraper.succeeded ?? "—"}/{scraper.totalSites ?? testSites.sites.length}</div>
          <div className="label">Sites scraped</div>
        </div>
      )}
      {critique && (
        <div className="summary-stat">
          <div className="value mono">{critique.totalClaims}</div>
          <div className="label">Claims generated</div>
        </div>
      )}
      {verifier && (
        <>
          <div className="summary-stat">
            <div className="value mono">{verifier.totalVerifiedClaims}</div>
            <div className="label">Claims accepted</div>
          </div>
          <div className="summary-stat">
            <div className="value mono">{verifier.totalRejectedClaims}</div>
            <div className="label">Claims rejected</div>
          </div>
          <div className="summary-stat">
            <div className="value mono">
              {verifier.overallHallucinationRate === null ? "—" : `${(verifier.overallHallucinationRate * 100).toFixed(1)}%`}
            </div>
            <div className="label">Hallucination rate</div>
          </div>
        </>
      )}
    </div>
  );
}

function ClaimsList({ claims }) {
  return claims.map((c, i) => (
    <div className="claim-row" key={i}>
      <div className="claim-issue">{c.issue}</div>
      <div className="claim-evidence">{c.basedOn}</div>
    </div>
  ));
}

function VerifiedClaimsList({ verified, rejected }) {
  return (
    <>
      {verified.map((c, i) => (
        <div className="claim-row" key={`v${i}`}>
          <span className="tag accept">Accepted</span>
          <div className="claim-issue" style={{ marginTop: 6 }}>{c.issue}</div>
          <div className="claim-evidence accepted">{c.evidence}</div>
        </div>
      ))}
      {rejected.map((c, i) => (
        <div className="claim-row" key={`r${i}`}>
          <span className="tag reject">Rejected</span>
          <div className="claim-issue" style={{ marginTop: 6 }}>{c.issue}</div>
          <div className="claim-evidence rejected">{c.reason}</div>
        </div>
      ))}
    </>
  );
}

function SiteCard({ entry }) {
  const { site, stages, screenshotRelPath } = entry;
  const screenshotFile = screenshotRelPath ? screenshotRelPath.split(/[/\\]/).pop() : null;

  return (
    <details className="site-card">
      <summary>
        <div className="site-head">
          <span className="site-name">{site.name}</span>
          <span className="site-meta">{site.category} · {site.location}</span>
        </div>
        <Trail stages={stages} />
      </summary>

      <div className="site-body">
        {screenshotFile && (
          <div className="detail-block">
            <h4>Desktop screenshot</h4>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="screenshot-thumb" src={`/api/screenshot?file=${encodeURIComponent(screenshotFile)}`} alt={`${site.name} homepage screenshot`} />
          </div>
        )}

        {stages.scrape.state === "error" && (
          <div className="detail-block">
            <h4>Scrape</h4>
            <div className="skip-note">{stages.scrape.detail}</div>
          </div>
        )}
        {stages.scrape.state === "warning" && (
          <div className="detail-block">
            <h4>Scrape</h4>
            <div className="skip-note">{stages.scrape.detail}</div>
          </div>
        )}

        {stages.critique.state === "ok" && (
          <div className="detail-block">
            <h4>Critique — raw claims</h4>
            <ClaimsList claims={stages.critique.claims} />
          </div>
        )}
        {stages.critique.state === "skipped" && (
          <div className="detail-block">
            <h4>Critique</h4>
            <div className="skip-note">{stages.critique.detail}</div>
          </div>
        )}

        {(stages.verify.state === "ok" || stages.verify.state === "mixed") && (
          <div className="detail-block">
            <h4>Verify — accept/reject</h4>
            <VerifiedClaimsList verified={stages.verify.verifiedClaims} rejected={stages.verify.rejectedClaims} />
          </div>
        )}
        {stages.verify.state === "skipped" && (
          <div className="detail-block">
            <h4>Verify</h4>
            <div className="skip-note">{stages.verify.detail}</div>
          </div>
        )}

        {stages.pitch.state === "ok" && (
          <div className="detail-block">
            <h4>Pitch draft</h4>
            <div className="claim-row" style={{ whiteSpace: "pre-wrap" }}>{stages.pitch.text}</div>
          </div>
        )}
        {stages.pitch.state === "not-run" && (
          <div className="detail-block">
            <h4>Pitch</h4>
            <div className="skip-note">Not built yet — Phase 5 (Pitch-Writer Agent) hasn't run.</div>
          </div>
        )}
      </div>
    </details>
  );
}

export default function Home() {
  const { sites, summaries } = getDashboardData(testSites);
  const scrapedCount = sites.filter((s) => s.stages.scrape.state !== "not-run").length;
  const phaseLabel = scrapedCount === 0 ? "Phase 0" : "Phases 0–4";

  return (
    <main style={{ maxWidth: 860, margin: "60px auto 100px", padding: "0 20px" }}>
      <p style={{ color: "#c0562a", fontWeight: 700, fontSize: 13, letterSpacing: 1, textTransform: "uppercase" }}>
        micro1 Hackathon — BIT
      </p>
      <h1 style={{ fontSize: 28, marginBottom: 4 }}>Website Audit → Pitch Generator</h1>
      <p style={{ color: "#5b6168", marginBottom: 28, maxWidth: 620 }}>
        {phaseLabel} wired into this dashboard. Each site below shows the real, on-disk output of every
        agent that has run against it — expand a site to see its screenshot, raw critique claims, and
        the Verifier's accept/reject decision for each one.
      </p>

      <SummaryStrip summaries={summaries} />

      <h2 style={{ fontSize: 15, marginBottom: 12, color: "#8a8f98", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Fixed test set ({testSites.sites.length} sites)
      </h2>

      {sites.map((entry) => (
        <SiteCard key={entry.site.id} entry={entry} />
      ))}
    </main>
  );
}
