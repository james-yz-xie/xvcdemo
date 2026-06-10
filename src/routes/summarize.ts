import { Hono } from "hono";
import type { Env } from "../types";
import { getSession } from "../services/storage";
import { callLLM } from "../services/llm";
import { FALLBACK_5W1H } from "../services/fallback";
import { buildSummaryPrompt } from "../prompts/summary";
import type { SummarizeRequest, SummarizeResponse } from "../types";

const app = new Hono<Env>();

app.post("/", async (c) => {
  const body = await c.req.json<SummarizeRequest>();
  const { sessionId, chapterIndex, model } = body;

  if (!sessionId || chapterIndex == null) {
    return c.json({ error: "Missing sessionId or chapterIndex" }, 400);
  }

  let apiKey = c.env.GEMINI_API_KEY;
  if (model === 'lmstudio') {
    apiKey = 'lm-local';
  } else if (model === 'kimi') {
    apiKey = c.env.KIMI_API_KEY ?? '';
  }
  if (!apiKey) {
    return c.json({ error: "API key not configured" }, 500);
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
    const raw = await callLLM(prompt, apiKey, model);
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
    console.error("[summarize] Gemini error:", message);

    // Return fallback 5W1H for demo continuity
    const fallback = FALLBACK_5W1H[String(chapterIndex)];
    if (fallback) {
      return c.json({
        ...fallback,
        _notice: "演示数据 — Gemini API 暂不可用",
      });
    }

    return c.json({ error: message }, 500);
  }
});

export default app;

function extractJsonFromResponse(text: string): unknown {
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch {
      // fall through
    }
  }

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
