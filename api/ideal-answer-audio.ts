import type { VercelRequest, VercelResponse } from "@vercel/node";
import { neon } from "@neondatabase/serverless";

/**
 * Public, unauthenticated — the ideal-answer TEXT this narrates is already
 * fully public on ideal-answers.html, so gating the audio would protect
 * nothing. Rows are synced in ahead of time by scripts/sync-ideal-answer-audio.mjs
 * from OSCE Coach; there is no live synthesis fallback here (unlike Coach's
 * own /api/ideal-answer-audio) — a cache miss just means the sync hasn't
 * run yet for that station.
 */

async function ensureEnv() {
  if (process.env.DATABASE_URL) return;
  const { config } = await import("dotenv");
  config({ path: ".env.local" });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await ensureEnv();
  if (!process.env.DATABASE_URL) {
    res.status(500).json({ error: "Server not configured" });
    return;
  }
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const stationId = req.query.station;
  if (typeof stationId !== "string" || !/^st-\d+$/.test(stationId)) {
    res.status(400).json({ error: "station must look like st-NN" });
    return;
  }

  const sql = neon(process.env.DATABASE_URL);
  const [row] = await sql`
    SELECT mime_type, data FROM ideal_answer_audio WHERE station_id = ${stationId}
  `;
  if (!row) {
    res.status(404).json({ error: "No narration cached for this station yet" });
    return;
  }

  const buf = Buffer.from(row.data, "base64");
  // Immutable: a text edit changes text_hash and gets a fresh sync run, but
  // never rewrites this same station_id's audio in place without one, so a
  // long CDN cache is safe.
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.setHeader("Content-Type", row.mime_type);
  res.setHeader("Content-Length", String(buf.length));
  res.status(200).send(buf);
}
