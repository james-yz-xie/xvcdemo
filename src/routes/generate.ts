import { Hono } from "hono";
import type { Env } from "../types";
import { streamGemini } from "../services/gemini";
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

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  const generate = async () => {
    let fullText = "";
    let quotaExceeded = false;

    try {
      for await (const chunk of streamGemini(prompt, apiKey)) {
        fullText += chunk.text;
        await writer.write(new TextEncoder().encode(chunk.text));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Generation failed";

      if (message.includes("429") || message.includes("quota")) {
        quotaExceeded = true;

        // Show quota-exceeded notice with instructions
        const notice =
          `\n\n---\n\n` +
          `⚠️ **Gemini API 免费额度已用完**\n\n` +
          `当前展示的是预生成的演示内容。如需实时生成，请按以下步骤获取新 API Key：\n\n` +
          `1. 访问 [Google AI Studio](https://aistudio.google.com/api-keys)\n` +
          `2. 点击 "Create API Key"\n` +
          `3. 选择任意 Google 项目（或创建新项目）\n` +
          `4. 复制生成的 Key（格式：AIza...）\n` +
          `5. 在项目目录运行：\`npx wrangler secret put GEMINI_API_KEY\`\n\n` +
          `---\n\n`;

        await writer.write(new TextEncoder().encode(notice));

        // Stream fallback demo content
        fullText = FALLBACK_ARTICLE;
        const chunks = chunkText(fullText, 8);
        for (const text of chunks) {
          await writer.write(new TextEncoder().encode(text));
          await sleep(40);
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

    const suffix = quotaExceeded
      ? `\n\n<!--SESSION:${sessionId}-->`
      : `\n\n<!--SESSION:${sessionId}-->`;
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

// ─── Helpers ────────────────────────────────────────────────

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
