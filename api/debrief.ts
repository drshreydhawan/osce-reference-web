import type { VercelRequest, VercelResponse } from "@vercel/node";
import fs from "node:fs";
import path from "node:path";

// Private candidate debriefs — full HTML lives under api/_private/, which
// Vercel never serves as a static file (only api/*.ts route handlers are
// exposed), so the only way to reach the content is through this
// password-checked handler. Same pattern as api/feedback.ts's admin gate.
const FILES: Record<string, string> = {
  shamindhi: "shamindhi.html",
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const password =
    (req.headers["x-debrief-password"] as string | undefined) ??
    (req.query.password as string | undefined);
  if (!process.env.DEBRIEF_PASSWORD || password !== process.env.DEBRIEF_PASSWORD) {
    res.status(401).send("Unauthorized");
    return;
  }

  const who = (req.query.who as string | undefined) ?? "";
  const file = FILES[who];
  if (!file) {
    res.status(404).send("Not found");
    return;
  }

  const html = fs.readFileSync(path.join(process.cwd(), "api", "_private", file), "utf8");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  res.setHeader("Cache-Control", "private, no-store");
  res.status(200).send(html);
}
