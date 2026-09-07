/**
 * Copy narrated ideal-answer audio from OSCE Coach's database into this
 * site's own database, keyed by the `st-NN` id used in ideal-answers.html.
 *
 * One-way, like the fee-content sync (see ../FEE-CONTENT-MOVED.md) but in
 * the opposite direction: Coach is the source of truth for the ideal-answer
 * TEXT and its narration; this site serves a public copy alongside the
 * (already public) text on ideal-answers.html. No live cross-project call
 * happens at request time — api/ideal-answer-audio.ts only ever reads from
 * this site's own DB, which this script keeps in sync.
 *
 * The station_id here is reference-web's own `st-NN` (from the page's
 * `id="st-NN"` case-card attribute), not Coach's station id — the two are
 * joined by PQ number, which is the one identifier both sites already show.
 *
 * Idempotent: skips any station whose text_hash already matches Coach's
 * current ideal answer, same discipline as Coach's own warm-ideal-answer-audio.ts.
 *
 * Usage:
 *   node scripts/sync-ideal-answer-audio.mjs            # dry run
 *   node scripts/sync-ideal-answer-audio.mjs --apply
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const apply = process.argv.includes("--apply");

const COACH_ENV_PATH = "../../osce-examiner-local/.env.local";
const coachEnv = {};
for (const line of readFileSync(fileURLToPath(new URL(COACH_ENV_PATH, import.meta.url)), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) coachEnv[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
}
const coachDbUrl = coachEnv.DATABASE_URL;
if (!coachDbUrl) throw new Error("Could not read DATABASE_URL from Coach's .env.local");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set for this site");

// st-NN -> PQ number, parsed straight from the page so this script never
// drifts from what's actually live on ideal-answers.html.
const html = readFileSync(fileURLToPath(new URL("../ideal-answers.html", import.meta.url)), "utf8");
const parts = html.split(/(?=<div class="case-card" id="st-\d+">)/);
const stationToPq = new Map();
for (const part of parts) {
  const idMatch = part.match(/^<div class="case-card" id="(st-\d+)">/);
  if (!idMatch) continue;
  const pqMatch = part.match(/PQ-(\d+)/);
  if (pqMatch) stationToPq.set(idMatch[1], Number(pqMatch[1]));
}
console.log(`${stationToPq.size} case-cards mapped to a PQ number on ideal-answers.html`);

const coachSql = neon(coachDbUrl);
const siteSql = neon(process.env.DATABASE_URL);

// Metadata only, never `data` in bulk — that blob is multi-MB per row, and a
// plain select-all across 81 rows blows past Neon's HTTP driver's 64MB
// response cap (this exact mistake already broke Coach's own warm-up script
// once; see the comment on Coach's scripts/warm-ideal-answer-audio.ts).
const coachMeta = await coachSql`
  SELECT s.pq_number, a.text_hash
  FROM ideal_answer_audio a
  JOIN stations s ON s.id = a.station_id
  WHERE s.pq_number IS NOT NULL
`;
const hashByPq = new Map(coachMeta.map((r) => [r.pq_number, r.text_hash]));

const existing = await siteSql`SELECT station_id, text_hash FROM ideal_answer_audio`;
const existingHash = new Map(existing.map((r) => [r.station_id, r.text_hash]));

const todo = [];
for (const [stationId, pq] of stationToPq) {
  const coachHash = hashByPq.get(pq);
  if (!coachHash) continue; // Coach hasn't cached audio for this PQ (shouldn't happen post-warm, but don't crash)
  if (existingHash.get(stationId) !== coachHash) todo.push({ stationId, pq });
}

console.log(`${stationToPq.size - todo.length} already in sync`);
console.log(`${todo.length} need copying`);

if (!todo.length) {
  console.log("Nothing to do.");
  process.exit(0);
}
if (!apply) {
  for (const t of todo) console.log(`  ${t.stationId} (PQ-${t.pq})`);
  console.log("\nDry run. Re-run with --apply.");
  process.exit(0);
}

let copied = 0;
let failed = 0;
for (const t of todo) {
  try {
    // Fetch this one row's bytes on its own — never batched with others.
    const [row] = await coachSql`
      SELECT a.text_hash, a.mime_type, a.data
      FROM ideal_answer_audio a
      JOIN stations s ON s.id = a.station_id
      WHERE s.pq_number = ${t.pq}
    `;
    if (!row) {
      console.error(`  ${t.stationId} (PQ-${t.pq}) MISSING on Coach mid-run, skipping`);
      continue;
    }
    await siteSql`
      INSERT INTO ideal_answer_audio (station_id, pq_number, text_hash, mime_type, data)
      VALUES (${t.stationId}, ${t.pq}, ${row.text_hash}, ${row.mime_type}, ${row.data})
      ON CONFLICT (station_id) DO UPDATE SET
        pq_number = EXCLUDED.pq_number,
        text_hash = EXCLUDED.text_hash,
        mime_type = EXCLUDED.mime_type,
        data = EXCLUDED.data,
        created_at = now()
    `;
    copied += 1;
    console.log(`  copied ${t.stationId} (PQ-${t.pq})`);
  } catch (err) {
    // A dropped connection on one row (seen in practice against Neon's HTTP
    // driver) shouldn't kill the whole batch — this script is idempotent,
    // so a failed row just gets picked up by the next --apply run.
    failed += 1;
    console.error(`  ${t.stationId} (PQ-${t.pq}) FAILED:`, err instanceof Error ? err.message : err);
  }
}
console.log(`\nDone — ${copied} copied, ${failed} failed.`);
if (failed) process.exitCode = 1;
