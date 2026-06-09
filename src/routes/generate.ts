import { Hono } from "hono";
import type { Env } from "../types";
import { streamGemini } from "../services/gemini";
import { streamKimi } from "../services/kimi";
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
  }>();

  const { videoId, subtitles, requirements } = body;

  if (!videoId || !subtitles) {
    return c.json({ error: "Missing videoId or subtitles" }, 400);
  }

  const apiKey = c.env.GEMINI_API_KEY;
  if (!apiKey) {
    return c.json({ error: "Gemini API key not configured" }, 500);
  }

  let parsedRequirements: Record<string, string> | undefined;
  if (requirements) {
    try {
      parsedRequirements = JSON.parse(requirements);
    } catch {
      // treat as raw string if not valid JSON
    }
  }

  const prompt = buildArticlePrompt(subtitles, parsedRequirements as never);

  // Use a TransformStream for reliable chunked transfer in Workers
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  // Run generation in the background so we can immediately return the Response
  const generate = async () => {
    let fullText = "";
    let usedFallback = false;

    try {
      for await (const chunk of streamGemini(prompt, apiKey)) {
        fullText += chunk.text;
        await writer.write(new TextEncoder().encode(chunk.text));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Generation failed";

      // Fallback 1: try Moonshot (Kimi) when Gemini quota exceeded
      if (message.includes("429") || message.includes("quota")) {
        const kimiKey = c.env.MOONSHOT_API_KEY;
        if (kimiKey) {
          try {
            for await (const chunk of streamKimi(prompt, kimiKey)) {
              fullText += chunk.text;
              await writer.write(new TextEncoder().encode(chunk.text));
            }
            usedFallback = true;
          } catch (moonshotErr) {
            const m =
              moonshotErr instanceof Error
                ? moonshotErr.message
                : "Moonshot failed";
            await streamFallback(writer);
            return;
          }
        } else {
          await streamFallback(writer);
          return;
        }
      } else {
        await writer.write(
          new TextEncoder().encode(`\n\n<!--ERROR:${message}-->`)
        );
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

    const suffix = usedFallback
      ? `\n\n<!--SESSION:${sessionId}-->\n\n<!--FALLBACK:kimi-->`
      : `\n\n<!--SESSION:${sessionId}-->`;
    await writer.write(new TextEncoder().encode(suffix));

    await writer.close();
  };

  generate(); // intentionally not awaited

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
});

export default app;

// ─── Helpers ────────────────────────────────────────────────

async function streamFallback(
  writer: WritableStreamDefaultWriter
): Promise<void> {
  // Fallback 2: pre-generated static content
  const chunks = chunkText(FALLBACK_ARTICLE, 8);
  for (const text of chunks) {
    await writer.write(new TextEncoder().encode(text));
    await sleep(40);
  }
  const sid = crypto.randomUUID();
  await writer.write(
    new TextEncoder().encode(
      `\n\n<!--SESSION:${sid}-->\n\n<!--FALLBACK:static-->`
    )
  );
  await writer.close();
}

function chunkText(text: string, size: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
    const end =
      i + 1 < matches.length ? matches[i + 1].index : text.length;

    const block = text.slice(start, end).trim();
    const content = block.replace(/^##\s+.+\n?/, "").trim();

    chapters.push({ title: matches[i].title, content });
  }

  return chapters;
}
