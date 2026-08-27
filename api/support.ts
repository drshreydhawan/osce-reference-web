import type { VercelRequest, VercelResponse } from "@vercel/node";
import { anthropic } from "@ai-sdk/anthropic";
import { streamText } from "ai";
import siteIndex from "../data/site-index.json";

type Chunk = {
  page: string;
  anchor: string;
  title: string;
  meta: string;
  text: string;
};
const chunks = siteIndex as unknown as Chunk[];

// Same model the TG4 assistant already runs on in production.
const CHAT_MODEL = "claude-sonnet-4-6";
const TOP_K = 5;
const PAGE_CONTEXT_MAX = 12000;

const STOPWORDS = new Set([
  "the","a","an","and","or","but","in","on","at","to","for","of","with","is","are","was","were",
  "be","been","this","that","these","those","it","its","as","by","from","what","why","how","when",
  "which","who","whom","do","does","did","can","could","should","would","i","you","he","she","they",
  "we","my","your","his","her","their","our","me","him","them","us","about","into","than","then",
  "there","here","have","has","had","not","no","yes","if","so","up","out","also","more","most",
  "station","patient","dental","dentist",
]);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

/**
 * Lightweight keyword retrieval (no embeddings, so the index needs no API key
 * to rebuild). Scores each chunk by how many distinct query terms it contains,
 * weighting title matches heavily since station titles are highly diagnostic.
 */
function retrieve(question: string, excludeAnchor?: string): Chunk[] {
  const terms = Array.from(new Set(tokenize(question)));
  if (!terms.length) return [];

  const scored = chunks.map((chunk) => {
    const haystack = (chunk.title + " " + chunk.meta + " " + chunk.text).toLowerCase();
    const title = (chunk.title + " " + chunk.meta).toLowerCase();
    let score = 0;
    for (const t of terms) {
      if (title.includes(t)) score += 3;
      if (haystack.includes(t)) score += 1;
    }
    return { chunk, score };
  });

  return scored
    .filter((s) => s.score > 0 && s.chunk.anchor !== excludeAnchor)
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_K)
    .map((s) => s.chunk);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ error: "Server is not configured" });
    return;
  }

  const { question, pageTitle, pagePath, pageContext, contextAnchor } =
    (req.body ?? {}) as {
      question?: string;
      pageTitle?: string;
      pagePath?: string;
      pageContext?: string;
      contextAnchor?: string;
    };

  if (!question || typeof question !== "string" || !question.trim()) {
    res.status(400).json({ error: "question is required" });
    return;
  }

  // The section the user is actually looking at, captured client-side from the
  // live DOM — so it can never drift out of sync with the published page.
  const currentSection =
    typeof pageContext === "string" && pageContext.trim()
      ? pageContext.trim().slice(0, PAGE_CONTEXT_MAX)
      : "";

  const related = retrieve(question, contextAnchor);
  const relatedText = related
    .map((c) => `--- ${c.title}${c.meta ? " (" + c.meta + ")" : ""} [${c.page}${c.anchor}] ---\n${c.text.slice(0, 3000)}`)
    .join("\n\n");

  const sources = related.map((c) => ({
    title: c.title,
    href: c.page + c.anchor,
  }));

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  // Station titles contain em-dashes and other non-ASCII characters, which are
  // illegal in HTTP header values — encode so the header stays ASCII-safe.
  res.setHeader("X-Sources", encodeURIComponent(JSON.stringify(sources)));

  try {
    const result = streamText({
      model: anthropic(CHAT_MODEL),
      system: [
        "You are the OSCE Coach study assistant, helping candidates preparing for the ADC Part 2 (OSCE) dental exam in Australia.",
        "",
        "HOW TO ANSWER:",
        "- Answer the actual question directly and concisely. Lead with the answer, not a preamble.",
        "- You may use your own clinical knowledge to explain the reasoning behind a station — drug interactions, mechanisms, why a finding matters — even when that detail is not written on the page. This is what makes you useful.",
        "- When the page content below covers something, prefer it and stay consistent with it.",
        "- Be explicit about what is exam-relevant vs. background interest.",
        "- Use short paragraphs and simple '-' bullets. This renders in a narrow chat panel, so do NOT use markdown tables, headings (#), or horizontal rules. Bold with **text** is fine.",
        "- Keep it tight — a few short paragraphs or a handful of bullets, not an essay, unless asked to go deeper.",
        "",
        "IMPORTANT LIMITS:",
        "- For specific drug doses, regimens and protocols, defer to Therapeutic Guidelines — point candidates to the TG4 Bible page on this site rather than quoting a dose from memory. Say plainly when you are not certain.",
        "- You are a study aid for exam preparation, not a source of clinical advice for treating real patients.",
        "- If a question is unrelated to dentistry or ADC exam prep, say so briefly and redirect.",
        "",
        currentSection
          ? `THE SECTION THE CANDIDATE IS CURRENTLY READING${pageTitle ? ` (page: ${pageTitle})` : ""}:\n${currentSection}`
          : pagePath
            ? `The candidate is on the page: ${pagePath}`
            : "",
        "",
        relatedText ? `OTHER POSSIBLY RELEVANT CONTENT FROM THIS SITE:\n${relatedText}` : "",
      ].join("\n"),
      prompt: question,
      onError: (event) => {
        console.error("support streamText onError:", JSON.stringify(event));
      },
    });

    for await (const chunk of result.textStream) {
      res.write(chunk);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("support answer generation failed:", message);
    res.write(`\n\n[Error generating answer: ${message}]`);
  }
  res.end();
}
