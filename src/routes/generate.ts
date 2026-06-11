import { Hono } from "hono";
import type { Env } from "../types";
import { streamLLM } from "../services/llm";
import { FALLBACK_ARTICLE } from "../services/fallback";
import { saveSession } from "../services/storage";
import { buildArticlePrompt } from "../prompts/article";
import type { SessionContext, Chapter } from "../types";

const app = new Hono<Env>();

app.post("/", async (c) => {
  const body = await c.req.json<{
    videoId: string;
    subtitles: string;
    requirements?: string;
    model?: string;
  }>();

  const { videoId, subtitles, requirements, model } = body;

  if (!videoId || !subtitles) {
    return c.json({ error: "Missing videoId or subtitles" }, 400);
  }

  let parsedRequirements: Record<string, string> | undefined;
  if (requirements) {
    try {
      parsedRequirements = JSON.parse(requirements);
    } catch {
      // treat as raw string if not valid JSON
    }
  }

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  const generate = async () => {
    let fullText = "";

    if (model === 'demo') {
      fullText = FALLBACK_ARTICLE;
      await writer.write(new TextEncoder().encode(fullText));
    } else {
      let apiKey = c.env.GEMINI_API_KEY;
      if (model === 'lmstudio') {
        apiKey = 'lm-local';
      } else if (model === 'kimi') {
        apiKey = c.env.KIMI_API_KEY ?? '';
      }
      if (!apiKey) {
        await writer.write(new TextEncoder().encode("<!--ERROR:API key not configured-->"));
        await writer.close();
        return;
      }

      const prompt = buildArticlePrompt(subtitles, parsedRequirements as never);
      try {
        for await (const chunk of streamLLM(prompt, apiKey, model)) {
          fullText += chunk.text;
          await writer.write(new TextEncoder().encode(chunk.text));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Generation failed";
        await writer.write(new TextEncoder().encode(`\n\n<!--ERROR:${message}-->`));
        await writer.close();
        return;
      }
    }

    const chapters = parseChapters(fullText);
    const sessionId = crypto.randomUUID();

    const ctx: SessionContext = {
      videoId,
      subtitles,
      requirements: parsedRequirements as never,
      fullArticle: fullText,
      chapters,
      createdAt: Date.now(),
    };

    await saveSession(c.env.SESSIONS, sessionId, ctx);

    const suffix = `\n\n<!--SESSION:${sessionId}-->`;
    await writer.write(new TextEncoder().encode(suffix));
    await writer.close();
  };

  generate();

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
});

export default app;

function parseChapters(text: string): Chapter[] {
  const chapters: Chapter[] = [];
  const headingRe = /^##\s+(.+)$/gm;
  const matches: Array<{ title: string; index: number }> = [];
  let match;

  while ((match = headingRe.exec(text)) !== null) {
    matches.push({ title: match[1].trim(), index: match.index });
  }

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const block = text.slice(start, end).trim();
    const content = block.replace(/^##\s+.+\n?/, "").trim();
    chapters.push({ title: matches[i].title, content });
  }

  return chapters;
}
