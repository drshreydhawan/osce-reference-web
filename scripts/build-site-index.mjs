// Builds data/site-index.json — a plain-text (no embeddings) index over the
// site's own content: all 66 stations from ideal-answers.html plus the other
// reference pages. Powers the site-wide support bot in api/support.ts, which
// does keyword retrieval over this file.
//
// Deliberately embedding-free: no OpenAI key needed to rebuild, the file stays
// small enough to ship in the function bundle, and it can never drift out of
// sync with the HTML because it's generated straight from it.
//
// Re-run whenever page content changes:  node scripts/build-site-index.mjs
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&mdash;/g, "—")
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;|&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

const chunks = [];

// --- 1. ideal-answers.html: one chunk per station card ---------------------
const ideal = fs.readFileSync(path.join(ROOT, "ideal-answers.html"), "utf8");
const cardRe =
  /<div class="case-card" id="([^"]+)">([\s\S]*?)(?=<div class="case-card"|<h2 class="ia-cat"|<\/main>)/g;
let m;
let stationCount = 0;
while ((m = cardRe.exec(ideal)) !== null) {
  const id = m[1];
  const body = m[2];
  const titleMatch = body.match(/<h3>([\s\S]*?)<\/h3>/);
  const metaMatch = body.match(/<div class="ia-meta">([\s\S]*?)<\/div>/);
  const title = titleMatch ? stripTags(titleMatch[1]) : id;
  const meta = metaMatch ? stripTags(metaMatch[1]) : "";
  const text = stripTags(body);
  if (text.length < 50) continue;
  chunks.push({
    page: "/ideal-answers",
    anchor: "#" + id,
    title,
    meta,
    text,
  });
  stationCount++;
}
console.log(`ideal-answers: ${stationCount} station chunks`);

// --- 2. Other reference pages, split into readable sections ----------------
const OTHER_PAGES = [
  "antibiotics-in-tg.html",
  "dental-fee-ranges.html",
  "exam-craft.html",
  "gold-transcripts.html",
  "naz-notes.html",
  "odell-pearls.html",
  "index.html",
];
const MAX_CHARS = 2500;

for (const file of OTHER_PAGES) {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) continue;
  const html = fs.readFileSync(full, "utf8");
  const mainMatch = html.match(/<main[\s\S]*?>([\s\S]*?)<\/main>/i);
  const text = stripTags(mainMatch ? mainMatch[1] : html);
  if (text.length < 200) continue;

  const pageName = "/" + file.replace(/\.html$/, "");
  const title = file.replace(/\.html$/, "").replace(/-/g, " ");
  let buf = "";
  let part = 0;
  const flush = () => {
    if (buf.trim().length < 100) return;
    chunks.push({ page: pageName, anchor: "", title, meta: "", text: buf.trim() });
    part++;
    buf = "";
  };
  for (const sentence of text.split(/(?<=\.)\s+/)) {
    if ((buf + sentence).length > MAX_CHARS) flush();
    buf += sentence + " ";
  }
  flush();
  console.log(`${file}: ${part} chunks`);
}

fs.writeFileSync(path.join(ROOT, "data", "site-index.json"), JSON.stringify(chunks));
const kb = Math.round(fs.statSync(path.join(ROOT, "data", "site-index.json")).size / 1024);
console.log(`\nWrote data/site-index.json — ${chunks.length} chunks, ${kb}KB.`);
