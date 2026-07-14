import type { VercelRequest, VercelResponse } from "@vercel/node";
import { anthropic } from "@ai-sdk/anthropic";
import { streamText } from "ai";
import OpenAI from "openai";
import tg4Chunks from "../data/tg4-chunks.json";

type Chunk = { page: number; text: string; image: string; embedding: number[] };
const chunks = tg4Chunks as unknown as Chunk[];

const EMBED_MODEL = "text-embedding-3-small";
const CHAT_MODEL = "claude-sonnet-4-6";
const TOP_K = 5;

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

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const embedRes = await openai.embeddings.create({
    model: EMBED_MODEL,
    input: question,
  });
  const queryEmbedding = embedRes.data[0].embedding;

  const ranked = chunks
    .map((chunk) => ({ chunk, score: cosineSimilarity(queryEmbedding, chunk.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_K);

  const context = ranked
    .map(({ chunk }) => `--- TG4 page ${chunk.page} ---\n${chunk.text}`)
    .join("\n\n");
  const sourcePages = ranked.map(({ chunk }) => chunk.page);

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("X-Source-Pages", JSON.stringify(sourcePages));

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
  });

  for await (const chunk of result.textStream) {
    res.write(chunk);
  }
  res.end();
}
