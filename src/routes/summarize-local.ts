import { Hono } from "hono";
import type { Env } from "../types";
import { callLMStudio } from "../services/lmstudio";
import type { SummarizeResponse } from "../types";

const app = new Hono<Env>();

app.post("/", async (c) => {
  const body = await c.req.json<{ fullArticle: string; title: string; content: string }>();
  const { fullArticle, title, content } = body;

  if (!fullArticle || !title || !content) {
    return c.json({ error: "Missing fullArticle, title or content" }, 400);
  }

  const prompt = [
    "你是一位专业编辑。请基于以下视频完整文章和当前章节，提炼出该章节的 5W1H 总结。",
    "",
    "## 完整文章内容",
    fullArticle.slice(0, 8000),
    "",
    "## 当前章节",
    `标题：${title}`,
    `内容：${content}`,
    "",
    "## 输出要求",
    "1. 请只输出一个纯 JSON 对象，不要包含 markdown 代码块标记（如 ```json），不要添加任何额外文字、解释或前言。",
    "2. JSON 必须严格符合以下格式，键名必须是 who/what/when/where/why/how，不能有任何其他字段：",
    "",
    '{"who":"...","what":"...","when":"...","where":"...","why":"...","how":"..."}',
    "",
    "3. 每个字段简洁凝练，一句话概括，不超过 80 字。",
    "4. 如果某个维度在章节中确实没有体现，可以填写\"未明确提及\"，但不能省略该字段。",
  ].join("\n");

  try {
    const raw = await callLMStudio(prompt);
    console.log("[summarize-local] raw response:", raw);
    const parsed = extractJsonFromResponse(raw) as SummarizeResponse | null;

    if (!parsed) {
      return c.json({ error: "Failed to parse summary", raw: raw.slice(0, 500) }, 500);
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
    return c.json({ error: message }, 500);
  }
});

export default app;

function extractJsonFromResponse(text: string): unknown {
  const trimmed = text.trim();

  // 1. Try code block
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch {
      // fall through
    }
  }

  // 2. Try first JSON object
  const objectMatch = trimmed.match(/\{[\s\S]*?\}/);
  if (objectMatch) {
    try {
      return JSON.parse(objectMatch[0]);
    } catch {
      // fall through
    }
  }

  // 3. Try parsing the whole text
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through
  }

  return null;
}
