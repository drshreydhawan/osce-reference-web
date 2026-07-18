import type { VercelRequest, VercelResponse } from "@vercel/node";
import { anthropic } from "@ai-sdk/anthropic";
import { streamText } from "ai";
import OpenAI from "openai";
import tg4Chunks from "../data/tg4-chunks.json";

type Chunk = { page: number; text: string; image: string; embedding: number[] };
const chunks = tg4Chunks as unknown as Chunk[];

const EMBED_MODEL = "text-embedding-3-small";
const CHAT_MODEL = "claude-sonnet-4-6";
const TOP_K = 8;
// Retrieve a wider pool by pure similarity, then rerank so dose/table-dense
// pages float up — dosing tables often sit adjacent to the most "relevant"
// prose page and were getting missed at top-5.
const CANDIDATE_POOL = 16;

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Count dosing signals in a page's transcript — drug doses, units, frequencies,
// routes, and explicit dosing-table references.
const DOSE_PATTERNS = [
  /\b\d+(\.\d+)?\s?(mg|g|mcg|microgram|micrograms|ml|units?)\b/gi,
  /\b\d+[-\s]?hourly\b/gi,
  /\bfor\s+\d+\s+days?\b/gi,
  /\b(orally|intravenously|intramuscularly|topically|subcutaneous)\b/gi,
  /\btable\s+\d+\.\d+\b/gi,
];
function doseSignal(text: string): number {
  let n = 0;
  for (const re of DOSE_PATTERNS) {
    const m = text.match(re);
    if (m) n += m.length;
  }
  return n;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { question } = (req.body ?? {}) as { question?: string };
  if (!question || typeof question !== "string") {
    res.status(400).json({ error: "question is required" });
    return;
  }

  if (!process.env.OPENAI_API_KEY || !process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ error: "Server is not configured" });
    return;
  }

  let context: string;
  let sourcePages: number[];
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const embedRes = await openai.embeddings.create({
      model: EMBED_MODEL,
      input: question,
    });
    const queryEmbedding = embedRes.data[0].embedding;

    const pool = chunks
      .map((chunk) => ({ chunk, score: cosineSimilarity(queryEmbedding, chunk.embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, CANDIDATE_POOL);

    // Rerank the already-relevant pool: nudge dose/table-dense pages up. The
    // boost is small (max ~0.02 vs cosine ~0.3–0.6) so it breaks ties toward
    // dosing tables without overriding genuine semantic relevance.
    const ranked = pool
      .map((r) => ({
        ...r,
        rerank: r.score + Math.min(doseSignal(r.chunk.text), 10) * 0.002,
      }))
      .sort((a, b) => b.rerank - a.rerank)
      .slice(0, TOP_K);

    context = ranked
      .map(({ chunk }) => `--- TG4 page ${chunk.page} ---\n${chunk.text}`)
      .join("\n\n");
    sourcePages = ranked.map(({ chunk }) => chunk.page);
  } catch (err) {
    console.error("TG4 retrieval failed:", err instanceof Error ? err.message : err);
    res.status(500).json({ error: "Retrieval failed" });
    return;
  }

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("X-Source-Pages", JSON.stringify(sourcePages));

  try {
    const result = streamText({
      model: anthropic(CHAT_MODEL),
      system: [
        "You are the TG4 Bible assistant. You answer dental clinical questions strictly from the Therapeutic Guidelines 4 (TG4) excerpts below — this is the same source ADC OSCE candidates are examined against.",
        "Give a short key-points answer first (bullet points), then cite the TG4 page number(s) it came from, e.g. '(TG4 p.50)'.",
        "If the excerpts don't cover the question, say so plainly rather than filling in from outside knowledge — doses and protocols must only come from TG4.",
        "",
        context,
      ].join("\n"),
      prompt: question,
      onError: (event) => {
        console.error("TG4 streamText onError:", JSON.stringify(event));
      },
    });

    for await (const chunk of result.textStream) {
      res.write(chunk);
    }
    console.error(
      "TG4 stream finished. finishReason:",
      await result.finishReason,
      "warnings:",
      JSON.stringify(await result.warnings),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("TG4 answer generation failed:", message);
    res.write(`\n\n[Error generating answer: ${message}]`);
  }
  res.end();
}
