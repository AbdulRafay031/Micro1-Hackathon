import fs from "fs";
import path from "path";

// Serves screenshots straight out of data/runs/scraper/ for the dashboard.
// Local-dev-only helper — not meant to be internet-facing. `file` must be
// a bare filename (no slashes), so it can't be used to walk outside the
// scraper output directory.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const file = searchParams.get("file");

  if (!file || file.includes("/") || file.includes("\\") || file.includes("..")) {
    return new Response("Invalid file parameter", { status: 400 });
  }

  const filePath = path.join(process.cwd(), "data", "runs", "scraper", file);
  if (!fs.existsSync(filePath)) {
    return new Response("Not found", { status: 404 });
  }

  const buffer = fs.readFileSync(filePath);
  return new Response(buffer, {
    headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
  });
}
