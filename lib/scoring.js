/**
 * Shared helpers for the human-scored specificity tables (SCORING.md).
 *
 * Both data/runs/baseline/SCORING.md (Phase 1) and data/runs/pitch/SCORING.md
 * (Phase 6) use the same table shape so they can be scored with the same
 * rubric and parsed the same way here. The parser locates columns by
 * header text rather than a fixed index, so it doesn't break if the two
 * files end up with slightly different column sets.
 */

const fs = require("fs");

function buildScoringMarkdown({ title, instructions, rows }) {
  const header =
    `# ${title}\n\n${instructions}\n\n` +
    `| Site ID | Site | Category | Time (ms) | Specificity (1-5) | Notes |\n` +
    `|---|---|---|---|---|---|\n`;

  const body = rows
    .map(
      (r) =>
        `| ${r.siteId} | ${r.siteName} | ${r.category} | ${
          r.timeMs != null ? r.timeMs : "n/a"
        } | _fill in_ | _fill in_ |`
    )
    .join("\n");

  return header + body + "\n";
}

/**
 * Parses a SCORING.md table into { [siteId]: number|null }. A cell that
 * isn't a valid number (including the "_fill in_" placeholder) is null,
 * not zero — so an unfilled row never silently drags an average down.
 */
function parseScoringMarkdown(filePath) {
  if (!fs.existsSync(filePath)) return {};

  const text = fs.readFileSync(filePath, "utf8");
  const rows = text
    .split("\n")
    .filter((line) => line.trim().startsWith("|"))
    .map((line) =>
      line
        .split("|")
        .map((cell) => cell.trim())
        .filter((_, i, arr) => i > 0 && i < arr.length - 1) // drop the empty cells from leading/trailing "|"
    );

  if (rows.length === 0) return {};

  const headerRow = rows.find((r) => r.some((c) => c === "Site ID"));
  if (!headerRow) return {};

  const siteIdCol = headerRow.indexOf("Site ID");
  const specificityCol = headerRow.findIndex((c) =>
    /specificity/i.test(c)
  );
  if (siteIdCol === -1 || specificityCol === -1) return {};

  const scores = {};
  for (const row of rows) {
    if (row === headerRow) continue;
    if (row.every((c) => /^-+$/.test(c))) continue; // markdown separator row
    const siteId = row[siteIdCol];
    if (!siteId) continue;
    const raw = row[specificityCol];
    const num = Number(raw);
    scores[siteId] = raw && Number.isFinite(num) ? num : null;
  }
  return scores;
}

function average(numbers) {
  const clean = numbers.filter((n) => n != null && Number.isFinite(n));
  if (clean.length === 0) return null;
  return clean.reduce((sum, n) => sum + n, 0) / clean.length;
}

module.exports = { buildScoringMarkdown, parseScoringMarkdown, average };
