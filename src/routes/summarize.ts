import { Hono } from "hono";
import type { Env } from "../types";
import { getSession } from "../services/storage";
import { callGemini } from "../services/gemini";
import { FALLBACK_5W1H } from "../services/fallback";
import { buildSummaryPrompt } from "../prompts/summary";
import type { SummarizeRequest, SummarizeResponse } from "../types";

const app = new Hono<Env>();

app.post("/", async (c) => {
  const body = await c.req.json<SummarizeRequest>();
  const { sessionId, chapterIndex } = body;

  if (!sessionId || chapterIndex == null) {
    return c.json({ error: "Missing sessionId or chapterIndex" }, 400);
  }

  const apiKey = c.env.GEMINI_API_KEY;
  if (!apiKey) {
    return c.json({ error: "Gemini API key not configured" }, 500);
  }

  const session = await getSession(c.env.SESSIONS, sessionId);
  if (!session) {
    return c.json({ error: "Session not found or expired" }, 404);
  }

  const chapter = session.chapters[chapterIndex];
  if (!chapter) {
    return c.json({ error: "Chapter not found" }, 404);
  }

  const prompt = buildSummaryPrompt(session.fullArticle, chapter);

  try {
    const raw = await callGemini(prompt, apiKey);
    const parsed = extractJsonFromResponse(raw) as SummarizeResponse | null;

    if (!parsed) {
      return c.json({ error: "Failed to parse summary" }, 500);
    }

    const summary: SummarizeResponse = {
      who: parsed.who ?? "N/A",
      what: parsed.what ?? "N/A",
      when: parsed.when ?? "N/A",
      where: parsed.where ?? "N/A",
      why: parsed.why ?? "N/A",
      how: parsed.how ?? "N/A",
    };

    return c.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Summary failed";

    // Graceful fallback for quota exceeded
    if (message.includes("429") || message.includes("quota")) {
      const fallback = FALLBACK_5W1H[String(chapterIndex)];
      if (fallback) {
        const summary: SummarizeResponse = {
          who: fallback.who,
          what: fallback.what,
          when: fallback.when,
          where: fallback.where,
          why: fallback.why,
          how: fallback.how,
        };
        return c.json(summary);
      }
    }

    return c.json({ error: message }, 500);
  }
});

export default app;

// ─── Helpers ────────────────────────────────────────────────

function extractJsonFromResponse(text: string): unknown {
  // Try to find JSON object in the response, handling markdown code blocks
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch {
      // fall through
    }
  }

  // Try raw JSON object
  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    try {
      return JSON.parse(objectMatch[0]);
    } catch {
      // fall through
    }
  }

  return null;
}
