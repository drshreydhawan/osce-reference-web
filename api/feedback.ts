import type { VercelRequest, VercelResponse } from "@vercel/node";
import { neon } from "@neondatabase/serverless";

async function ensureEnv() {
  if (process.env.DATABASE_URL) return;
  // vercel dev doesn't always inject .env.local into function invocations
  // locally; production always has real platform env vars, so this is a
  // no-op there.
  const { config } = await import("dotenv");
  config({ path: ".env.local" });
}

const MESSAGE_MAX = 2000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await ensureEnv();
  if (!process.env.DATABASE_URL) {
    res.status(500).json({ error: "Server not configured" });
    return;
  }

  if (req.method === "GET") {
    const password =
      (req.headers["x-admin-password"] as string | undefined) ??
      (req.query.password as string | undefined);
    if (!process.env.ADMIN_FEEDBACK_PASSWORD || password !== process.env.ADMIN_FEEDBACK_PASSWORD) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const sql = neon(process.env.DATABASE_URL);
    const rows = await sql`
      SELECT id, message, usefulness_rating, realism_rating, page, created_at
      FROM feedback ORDER BY created_at DESC LIMIT 500
    `;
    res.status(200).json({ rows });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { message, usefulnessRating, realismRating, page } = (req.body ?? {}) as {
    message?: string;
    usefulnessRating?: number;
    realismRating?: number;
    page?: string;
  };

  const trimmed = (message ?? "").trim();

  function toRating(v: unknown): number | null {
    return typeof v === "number" && v >= 1 && v <= 5 ? Math.round(v) : null;
  }
  const safeUsefulness = toRating(usefulnessRating);
  const safeRealism = toRating(realismRating);

  if (!trimmed && safeUsefulness === null && safeRealism === null) {
    res.status(400).json({ error: "at least a rating or a message is required" });
    return;
  }

  const safePage = typeof page === "string" ? page.slice(0, 200) : "";

  const sql = neon(process.env.DATABASE_URL);
  await sql`
    INSERT INTO feedback (message, usefulness_rating, realism_rating, page)
    VALUES (${trimmed.slice(0, MESSAGE_MAX)}, ${safeUsefulness}, ${safeRealism}, ${safePage})
  `;

  res.status(200).json({ ok: true });
}
