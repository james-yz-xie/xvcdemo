// ─────────────────────────────────────────────────────────────
// Kimi Code API service — OpenAI-compatible
// https://api.kimi.com/coding/v1
// ─────────────────────────────────────────────────────────────

const BASE = "https://api.kimi.com/coding/v1";
const MODEL = "kimi-for-coding";

export interface KimiChunk {
  text: string;
}

/** Stream content from Kimi Code via SSE */
export async function* streamKimi(
  prompt: string,
  apiKey: string
): AsyncGenerator<KimiChunk> {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      stream: true,
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "unknown");
    throw new Error(`Kimi API error ${res.status}: ${err}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // SSE format: data: {...}\n\n
    const lines = buffer.split("\n\n");
    buffer = lines.pop() ?? "";

    for (const block of lines) {
      const text = extractSseChunk(block);
      if (text) yield { text };
    }
  }

  // Flush
  if (buffer.trim()) {
    const text = extractSseChunk(buffer);
    if (text) yield { text };
  }
}

/** Non-streaming call */
export async function callKimi(
  prompt: string,
  apiKey: string
): Promise<string> {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      stream: false,
      temperature: 0.5,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "unknown");
    throw new Error(`Kimi API error ${res.status}: ${err}`);
  }

  const data = (await res.json()) as ChatCompletionResponse;
  return data.choices?.[0]?.message?.content ?? "";
}

// ─── Helpers ────────────────────────────────────────────────

function extractSseChunk(block: string): string | null {
  const line = block
    .split("\n")
    .find((l) => l.startsWith("data:"));
  if (!line) return null;

  const payload = line.slice(5).trim();
  if (payload === "[DONE]") return null;

  try {
    const parsed = JSON.parse(payload) as StreamChunk;
    return parsed.choices?.[0]?.delta?.content ?? "";
  } catch {
    return null;
  }
}

interface StreamChunk {
  choices?: Array<{
    delta?: { content?: string };
  }>;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: { content?: string };
  }>;
}
